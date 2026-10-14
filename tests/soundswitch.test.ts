import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { parseSoundSwitchVenue, type SoundSwitchFixture } from '../src/shared/soundswitch'
import { fixtureTypeFromMode, projectFromSoundSwitch } from '../src/renderer/src/model/soundswitchImport'
import { defaultProject } from '../src/renderer/src/model/project'

const mover: SoundSwitchFixture = {
  definitionId: 1,
  definition: 'Test Spot (Demo)',
  manufacturer: 'Test',
  universe: 1,
  address: 181,
  wheels: {},
  mode: {
    name: 'Mode 1',
    channels: 6,
    heads: [],
    attributes: [
      { code: 3, name: 'Pan', width: 2, coarse: 0, fine: 1 },
      { code: 4, name: 'Tilt', width: 1, coarse: 2, fine: 2 },
      { code: 1, name: 'Dimmer', width: 1, coarse: 3, fine: 3 },
      { code: 14, name: 'Red', width: 1, coarse: 4, fine: 4 }
    ]
  }
}

describe('SoundSwitch import', () => {
  it('turns attributes into channel functions', () => {
    const type = fixtureTypeFromMode(mover)
    expect(type.channels).toEqual(['pan', 'panFine', 'tilt', 'dimmer', 'red', 'reserved'])
    expect(type.body).toBe('movingHead')
  })

  it('counts cells on pixel bars', () => {
    const attributes = [0, 1, 2, 3].flatMap((c) => [
      { code: 14, name: `Red ${c + 1}`, width: 1, coarse: c * 3, fine: c * 3 },
      { code: 15, name: `Green ${c + 1}`, width: 1, coarse: c * 3 + 1, fine: c * 3 + 1 },
      { code: 16, name: `Blue ${c + 1}`, width: 1, coarse: c * 3 + 2, fine: c * 3 + 2 }
    ])
    const heads = [0, 1, 2, 3].map((c) => ({ name: `Cell ${c + 1}`, attributes: [c * 3, c * 3 + 1, c * 3 + 2] }))
    const type = fixtureTypeFromMode({ ...mover, definition: 'Test Tube', mode: { name: 'Mode 1', channels: 12, attributes, heads } })
    expect(type.cells).toBe(4)
    expect(type.body).toBe('bar')
    expect(type.heads?.map((h) => h.role)).toEqual(['pixel', 'pixel', 'pixel', 'pixel'])
    expect(type.heads?.[2].ch.green).toEqual({ coarse: 7 })
  })

  it('keeps positions of fixtures it already knows', () => {
    const first = projectFromSoundSwitch([mover], defaultProject(), 'Show')
    const moved = { ...first, fixtures: first.fixtures.map((f) => ({ ...f, position: [1, 2, 3] as [number, number, number] })) }
    const again = projectFromSoundSwitch([mover], moved, 'Show')
    expect(again.fixtures[0].position).toEqual([1, 2, 3])
    expect(again.fixtures[0].universe).toBe(1)
    expect(again.fixtures[0].address).toBe(181)
  })
})

// Run against a real venue file: SOUNDSWITCH_VENUE=/path/to/SoundSwitchVenues.bin npm test
const real = process.env.SOUNDSWITCH_VENUE
describe.skipIf(!real || !existsSync(real))('a real SoundSwitch venue', () => {
  it('finds patched fixtures with sensible addresses', () => {
    const venue = parseSoundSwitchVenue(new Uint8Array(readFileSync(real!)))
    expect(venue.fixtures.length).toBeGreaterThan(0)
    for (const f of venue.fixtures) {
      expect(f.address).toBeGreaterThanOrEqual(1)
      expect(f.address + f.mode.channels - 1).toBeLessThanOrEqual(512)
    }
  })

  it('reads the fixture groups (uplights 1, tubes 2, movers 3, washes 4 in the reference venue)', () => {
    const venue = parseSoundSwitchVenue(new Uint8Array(readFileSync(real!)))
    const groupOf = (name: RegExp) => [...new Set(venue.fixtures.filter((f) => name.test(f.definition)).map((f) => f.group))]
    expect(groupOf(/BO-IR4/)).toEqual([1])
    expect(groupOf(/BO-Tube/)).toEqual([2])
    expect(groupOf(/Spot 260|19X15W|Hybrid 140/)).toEqual([3])
    expect(groupOf(/^Wash FX$/)).toEqual([4])
  })
})

import { decodeHeads } from '../src/renderer/src/model/heads'

describe('decoding heads like the real fixture', () => {
  const wheelSpot: SoundSwitchFixture = {
    ...mover,
    definition: 'Intimidator Spot 260',
    wheels: { 'Wheel 1': [{ lo: 0, hi: 3, name: 'White', rgb: [255, 255, 255] }, { lo: 4, hi: 7, name: 'Red', rgb: [255, 0, 0] }] },
    mode: {
      name: 'Mode 2',
      channels: 4,
      attributes: [
        { code: 1, name: 'Dimmer', width: 1, coarse: 0, fine: 0 },
        { code: 41, name: 'Strobe', width: 1, coarse: 1, fine: 1, ranges: [
          { lo: 0, hi: 3, name: '', shutter: 'closed' }, { lo: 8, hi: 76, name: '', shutter: 'strobe' }, { lo: 216, hi: 255, name: '', shutter: 'open' }
        ] },
        { code: 2, name: 'Colour', width: 1, coarse: 2, fine: 2, wheel: 'Wheel 1' },
        { code: 3, name: 'Pan', width: 1, coarse: 3, fine: 3 }
      ],
      heads: [{ name: 'Cell 1', attributes: [0, 1, 2, 3] }]
    }
  }
  const type = fixtureTypeFromMode(wheelSpot)
  const levels = (values: number[]) => {
    const l = new Uint8Array(512)
    values.forEach((v, i) => (l[180 + i] = v))
    return l
  }

  it('uses the fixture\'s own shutter ranges: 0 is closed, 220 is open', () => {
    expect(decodeHeads(type, levels([255, 0, 0, 128]), 181, 0)[0].intensity).toBe(0)
    expect(decodeHeads(type, levels([255, 220, 0, 128]), 181, 0)[0].intensity).toBe(1)
  })

  it('reads the colour wheel slot', () => {
    expect(decodeHeads(type, levels([255, 220, 5, 128]), 181, 0)[0].color).toEqual([1, 0, 0])
  })

  it('uses the real pan range from the spec sheet', () => {
    expect(type.panRange).toBe(540)
    expect(decodeHeads(type, levels([255, 220, 0, 255]), 181, 0)[0].pan).toBeCloseTo(270)
  })
})

import { fixtureTypeFromMode as typeFrom } from '../src/renderer/src/model/soundswitchImport'

describe('master heads', () => {
  it('treats a dimmer-only head next to colour heads as the fixture master', () => {
    const bar: SoundSwitchFixture = {
      ...mover,
      definition: 'Rockville Pixel Hybrid Bar',
      mode: {
        name: 'Mode 1',
        channels: 5,
        attributes: [
          { code: 1, name: 'Dimmer', width: 1, coarse: 0, fine: 0 },
          { code: 41, name: 'Strobe', width: 1, coarse: 1, fine: 1 },
          { code: 14, name: 'Red', width: 1, coarse: 2, fine: 2 },
          { code: 15, name: 'Green', width: 1, coarse: 3, fine: 3 },
          { code: 16, name: 'Blue', width: 1, coarse: 4, fine: 4 }
        ],
        heads: [{ name: 'Main', attributes: [0, 1] }, { name: 'Section 1', attributes: [2, 3, 4] }]
      }
    }
    const type = typeFrom(bar)
    expect(type.heads![0].role).toBe('master')
    // Red at full, master at half: the section is half-bright red, and the master itself makes no light.
    const levels = new Uint8Array(512)
    levels.set([128, 0, 255, 0, 0], 0)
    const [main, section] = decodeHeads(type, levels, 1, 0)
    expect(main.intensity).toBe(0)
    expect(section.intensity).toBeCloseTo(0.5, 1)
    expect(section.color).toEqual([1, 0, 0])
  })
})
