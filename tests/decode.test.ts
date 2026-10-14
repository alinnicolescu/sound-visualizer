import { describe, expect, it } from 'vitest'
import { decodeFixture } from '../src/renderer/src/model/decode'
import { getFixtureType } from '../src/renderer/src/model/fixtureTypes'

const spot = getFixtureType('generic-spot-16')

describe('decodeFixture', () => {
  it('centres pan and tilt at half range', () => {
    const levels = new Uint8Array(512)
    levels[0] = 128 // pan coarse
    levels[2] = 128 // tilt coarse
    const state = decodeFixture(spot, levels, 1)
    expect(Math.abs(state.pan)).toBeLessThan(1)
    expect(Math.abs(state.tilt)).toBeLessThan(1)
  })

  it('reads its own channels from its start address', () => {
    const levels = new Uint8Array(512)
    levels[100 + 5] = 255 // dimmer of a fixture at address 101
    levels[100 + 7] = 255 // red
    const state = decodeFixture(spot, levels, 101)
    expect(state.intensity).toBe(1)
    expect(state.color).toEqual([1, 0, 0])
  })

  it('uses the fine channel for 16-bit pan', () => {
    const levels = new Uint8Array(512)
    levels[0] = 255
    levels[1] = 255
    expect(decodeFixture(spot, levels, 1).pan).toBeCloseTo(spot.panRange / 2)
  })

  it('maps zoom across the beam-angle range', () => {
    const levels = new Uint8Array(512)
    levels[11] = 255
    expect(decodeFixture(spot, levels, 1).beamAngle).toBe(spot.zoomRange[1])
  })
})
