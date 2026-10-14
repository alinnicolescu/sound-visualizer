/**
 * Art-Net test sender: pretends to be a lighting console.
 *
 *   npm run artnet:test              sends to this computer
 *   npm run artnet:test -- 2.0.0.10  sends to another machine
 *
 * It drives the default rig on universe 0: the six spots sweep and the PARs fade through colours.
 * Run it in a second terminal while the app is open, and the status pill should turn green.
 */
import { createSocket } from 'node:dgram'

const host = process.argv[2] ?? '127.0.0.1'
const universe = 0
const socket = createSocket('udp4')
if (host.endsWith('.255')) socket.bind(() => socket.setBroadcast(true))

// Same packet layout as src/shared/artnet.ts (kept separate so this runs with plain Node).
function artDmx(data, sequence) {
  const packet = Buffer.alloc(18 + 512)
  packet.write('Art-Net\0', 0, 'ascii')
  packet.writeUInt16LE(0x5000, 8) // OpDmx
  packet.writeUInt16BE(14, 10) // protocol version
  packet[12] = sequence
  packet[14] = universe & 0xff
  packet[15] = (universe >> 8) & 0x7f
  packet.writeUInt16BE(512, 16)
  Buffer.from(data).copy(packet, 18)
  return packet
}

const data = new Uint8Array(512)
let sequence = 1
const start = Date.now()

setInterval(() => {
  const t = (Date.now() - start) / 1000
  data.fill(0)
  for (let i = 0; i < 6; i++) {
    const a = i * 16 // spot i starts at address 1 + i*16
    data[a + 0] = 128 + Math.round(Math.sin(t * 0.8 + i) * 30) // pan
    data[a + 2] = 128 + Math.round(Math.sin(t * 1.1 + i * 0.5) * 35) // tilt
    data[a + 5] = 255 // dimmer
    data[a + 7] = i % 3 === 0 ? 255 : 40 // red
    data[a + 8] = i % 3 === 1 ? 255 : 40 // green
    data[a + 9] = i % 3 === 2 ? 255 : 40 // blue
    data[a + 11] = 60 // zoom
  }
  for (let i = 0; i < 4; i++) {
    const a = 96 + i * 8 // PAR i starts at address 97 + i*8
    const level = Math.round((Math.sin(t * 2 + i) * 0.5 + 0.5) * 255)
    data[a + 0] = level // dimmer
    data[a + 3] = 255 // blue
    data[a + 4] = 60 // white
  }
  socket.send(artDmx(data, sequence), 6454, host)
  sequence = sequence === 255 ? 1 : sequence + 1
}, 25) // 40 packets a second, like a real console

console.log(`Sending Art-Net universe ${universe} to ${host}:6454. Press Ctrl+C to stop.`)
