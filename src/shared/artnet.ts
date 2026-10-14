/**
 * Art-Net 4 — just the one packet we need: ArtDmx (OpCode 0x5000).
 * Spec: https://art-net.org.uk  (free from Artistic Licence)
 *
 * Layout of an ArtDmx packet:
 *   0..7   "Art-Net\0"         ID string
 *   8..9   0x00 0x50           OpCode 0x5000, little-endian
 *   10..11 0x00 0x0e           Protocol version 14, big-endian
 *   12     sequence            0 = sequencing disabled
 *   13     physical            input port (informational)
 *   14     SubUni              low byte of the 15-bit Port-Address
 *   15     Net                 high 7 bits of the Port-Address
 *   16..17 length              number of DMX slots, big-endian, even, 2..512
 *   18..   data                the DMX levels
 *
 * This file is shared by the Electron main process (which receives packets)
 * and the test sender script, so it must not import anything from Node or the DOM.
 */

export const ARTNET_PORT = 6454
const ID = [0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00] // "Art-Net\0"
const OP_DMX = 0x5000

export interface ArtDmx {
  /** 15-bit Port-Address (Net << 8 | SubUni). Most consoles call this the universe number. */
  universe: number
  sequence: number
  /** Always 512 long; slots the sender didn't include are 0. */
  data: Uint8Array
}

/** Returns the decoded packet, or null if this isn't a valid ArtDmx packet. */
export function parseArtDmx(packet: Uint8Array): ArtDmx | null {
  if (packet.length < 20) return null
  for (let i = 0; i < ID.length; i++) if (packet[i] !== ID[i]) return null
  const opCode = packet[8] | (packet[9] << 8)
  if (opCode !== OP_DMX) return null

  const universe = ((packet[15] & 0x7f) << 8) | packet[14]
  const length = (packet[16] << 8) | packet[17]
  if (length < 1 || length > 512 || packet.length < 18 + length) return null

  const data = new Uint8Array(512)
  data.set(packet.subarray(18, 18 + length))
  return { universe, sequence: packet[12], data }
}

/** Builds an ArtDmx packet. Used by the test sender and by the tests. */
export function buildArtDmx(universe: number, data: Uint8Array, sequence = 0): Uint8Array {
  let length = Math.min(512, Math.max(2, data.length))
  if (length % 2) length++ // the spec requires an even length
  const packet = new Uint8Array(18 + length)
  packet.set(ID, 0)
  packet[8] = OP_DMX & 0xff
  packet[9] = OP_DMX >> 8
  packet[10] = 0
  packet[11] = 14
  packet[12] = sequence & 0xff
  packet[13] = 0
  packet[14] = universe & 0xff
  packet[15] = (universe >> 8) & 0x7f
  packet[16] = length >> 8
  packet[17] = length & 0xff
  packet.set(data.subarray(0, length), 18)
  return packet
}

// ---------------------------------------------------------------------------
// Discovery. Controllers such as SoundSwitch broadcast an ArtPoll (OpCode 0x2000)
// to find devices. Every device answers with an ArtPollReply (0x2100) that says
// who it is and which universes it wants. Answering makes us appear in their
// list of Art-Net devices, so they know to send us DMX.
// ---------------------------------------------------------------------------

const OP_POLL = 0x2000
const OP_POLL_REPLY = 0x2100

export function isArtPoll(packet: Uint8Array): boolean {
  if (packet.length < 14) return false
  for (let i = 0; i < ID.length; i++) if (packet[i] !== ID[i]) return false
  return (packet[8] | (packet[9] << 8)) === OP_POLL
}

export interface PollReplyOptions {
  /** Our IPv4 address as four numbers, e.g. [192, 168, 1, 20]. */
  ip: [number, number, number, number]
  shortName: string
  longName: string
  /** The first of four consecutive universes we accept (0 = universes 0..3). */
  firstUniverse?: number
  mac?: number[]
}

/** Builds a 239-byte ArtPollReply as laid out in the Art-Net 4 spec. */
export function buildArtPollReply(options: PollReplyOptions): Uint8Array {
  const reply = new Uint8Array(239)
  const ascii = (text: string, offset: number, max: number) => {
    for (let i = 0; i < Math.min(text.length, max - 1); i++) reply[offset + i] = text.charCodeAt(i) & 0x7f
  }
  const first = options.firstUniverse ?? 0
  reply.set(ID, 0)
  reply[8] = OP_POLL_REPLY & 0xff
  reply[9] = OP_POLL_REPLY >> 8
  reply.set(options.ip, 10) // IP address
  reply[14] = ARTNET_PORT & 0xff // port, little-endian
  reply[15] = ARTNET_PORT >> 8
  reply[16] = 0 // firmware version
  reply[17] = 1
  reply[18] = (first >> 8) & 0x7f // NetSwitch
  reply[19] = (first >> 4) & 0x0f // SubSwitch
  reply[23] = 0xd0 // Status1: indicators normal, addresses set from the network allowed
  ascii(options.shortName, 26, 18)
  ascii(options.longName, 44, 64)
  ascii('#0001 [0000] Visualizer ready', 108, 64) // NodeReport
  reply[173] = 4 // NumPorts
  for (let p = 0; p < 4; p++) {
    reply[174 + p] = 0x80 // PortTypes: this port outputs DMX512 (it receives from the network)
    reply[182 + p] = 0x80 // GoodOutput: data is being output
    reply[190 + p] = (first + p) & 0x0f // SwOut: low 4 bits of each port's universe
  }
  reply[200] = 0x03 // Style: StVisual, a visualiser
  if (options.mac) reply.set(options.mac.slice(0, 6), 201)
  reply.set(options.ip, 207) // BindIp
  reply[211] = 1 // BindIndex
  reply[212] = 0x08 // Status2: supports 15-bit Port-Addresses
  return reply
}
