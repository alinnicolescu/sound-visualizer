/**
 * Turns raw DMX levels into what the light should be doing.
 * This is the "fixture decodes" step of the DMX path in the blueprint.
 */
import type { ChannelFunction, FixtureType } from './fixtureTypes'

export interface FixtureState {
  /** Degrees from the centre of the range: -panRange/2 .. +panRange/2. */
  pan: number
  tilt: number
  /** 0..1 */
  intensity: number
  /** Linear 0..1 colour of the beam. */
  color: [number, number, number]
  /** Beam angle in degrees. */
  beamAngle: number
  /** One colour per cell, already scaled by intensity, for pixel bars. */
  cells: Array<[number, number, number]>
}

/**
 * @param levels  the whole 512-channel universe
 * @param address the fixture's start address (1-based)
 * @param time    seconds, used for strobing
 */
export function decodeFixture(type: FixtureType, levels: Uint8Array, address: number, time = 0): FixtureState {
  // Find the value of each function the fixture has.
  const value: Partial<Record<string, number>> = {}
  type.channels.forEach((fn, i) => {
    value[fn] = levels[address - 1 + i] ?? 0
  })

  const coarseFine = (coarse?: number, fine?: number) => ((coarse ?? 0) * 256 + (fine ?? 0)) / 65535
  const has = (fn: string) => type.channels.includes(fn as never)

  const pan = has('pan') ? (coarseFine(value.pan, value.panFine) - 0.5) * type.panRange : 0
  const tilt = has('tilt') ? (coarseFine(value.tilt, value.tiltFine) - 0.5) * type.tiltRange : 0

  // Our generic shutter: 0-31 open, 32-255 strobe from slow to fast.
  // (Real fixtures each have their own strobe ranges; this is a reasonable average.)
  let shutter = 1
  const s = value.shutter ?? 0
  if (s >= 32) {
    const hz = 1 + ((s - 32) / 223) * 19
    shutter = (time * hz) % 1 < 0.25 ? 1 : 0
  }
  // No dimmer channel (many pixel bars): the colour channels carry the brightness.
  const intensity = (has('dimmer') ? (value.dimmer ?? 0) / 255 : 1) * shutter

  // Each cell is one set of colour channels. The k-th Red, Green, Blue... belong to cell k.
  const cellCount = Math.max(1, countOf(type, 'red'), countOf(type, 'white'))
  const cells: Array<[number, number, number]> = []
  for (let k = 0; k < cellCount; k++) {
    const level = (fn: ChannelFunction) => {
      const index = nthIndex(type, fn, k)
      return index < 0 ? 0 : (levels[address - 1 + index] ?? 0) / 255
    }
    const w = level('white')
    const a = level('amber')
    const u = level('uv')
    let rgb: [number, number, number]
    if (has('red') || has('white') || has('amber')) {
      rgb = [
        Math.min(1, level('red') + w + a + u * 0.25),
        Math.min(1, level('green') + w + a * 0.6),
        Math.min(1, level('blue') + w + u * 0.9)
      ]
    } else {
      rgb = [1, 1, 1] // a colour-wheel or white fixture
    }
    cells.push(rgb)
  }
  // The beam colour is the average of the cells.
  const color = cells
    .reduce((sum, c) => [sum[0] + c[0], sum[1] + c[1], sum[2] + c[2]] as [number, number, number], [0, 0, 0] as [number, number, number])
    .map((v) => v / cells.length) as [number, number, number]

  const [narrow, wide] = type.zoomRange
  const beamAngle = narrow + ((value.zoom ?? 0) / 255) * (wide - narrow)

  return { pan, tilt, intensity, color, beamAngle, cells }
}

function countOf(type: FixtureType, fn: ChannelFunction): number {
  return type.channels.filter((f) => f === fn).length
}

/** Index of the k-th channel with this function, or -1. */
function nthIndex(type: FixtureType, fn: ChannelFunction, k: number): number {
  let seen = 0
  for (let i = 0; i < type.channels.length; i++) {
    if (type.channels[i] !== fn) continue
    if (seen === k) return i
    seen++
  }
  return -1
}
