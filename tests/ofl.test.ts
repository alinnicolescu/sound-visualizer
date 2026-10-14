import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fixtureTypeFromOfl, libraryIndex, type OflFixture, type OflLibrary } from '../src/renderer/src/model/oflImport'
import { decodeHeads } from '../src/renderer/src/model/heads'

const library: OflLibrary = JSON.parse(readFileSync('resources/library/ofl.json', 'utf8'))

describe('the bundled fixture library', () => {
  it('converts every mode of every fixture without errors', () => {
    const index = libraryIndex(library)
    expect(index.length).toBeGreaterThan(500)
    for (const entry of index) {
      library.fixtures[entry.key].modes.forEach((mode, i) => {
        const type = fixtureTypeFromOfl(entry.key, entry.manufacturer, library.fixtures[entry.key], i)
        expect(type.channels.length).toBe(entry.modes[i].channels)
        expect(type.heads!.length).toBeGreaterThan(0)
        expect(() => decodeHeads(type, new Uint8Array(512).fill(128), 1, 0.5)).not.toThrow()
        void mode
      })
    }
  })

  it('reads a moving head the way the fixture behaves (Intimidator Spot 260)', () => {
    const fx = library.fixtures['chauvet-dj/intimidator-spot-260']
    const type = fixtureTypeFromOfl('chauvet-dj/intimidator-spot-260', 'Chauvet DJ', fx, 0)
    expect(type.spec!.look).toBe('mover')
    expect(type.spec!.size).toEqual([0.232, 0.351, 0.163]) // Chauvet's spec sheet: 232 × 351 × 163 mm
    expect(type.panRange).toBe(540)
    expect(type.tiltRange).toBe(270)
    const levels = new Uint8Array(512)
    levels[0] = 255 // pan, 16-bit: full right
    levels[1] = 255
    levels[5] = 30 // colour wheel: slot 5, red
    levels[10] = 255 // dimmer
    levels[11] = 230 // strobe channel: 216-255 is open
    const [head] = decodeHeads(type, levels, 1, 0)
    expect(head.color).toEqual([1, 0, 0])
    expect(head.intensity).toBe(1)
    expect(head.pan).toBeCloseTo(270, 0)
    levels[11] = 2 // 0-3 closed
    expect(decodeHeads(type, levels, 1, 0)[0].intensity).toBe(0)
  })
})

describe('matrix fixtures', () => {
  const bar: OflFixture = {
    name: 'Test Pixel Bar',
    categories: ['Pixel Bar'],
    physical: { dimensions: [1000, 100, 80] },
    matrix: { pixelCount: [3, 1, 1] },
    availableChannels: { Dimmer: { capability: { type: 'Intensity' } } },
    templateChannels: {
      'Red $pixelKey': { capability: { type: 'ColorIntensity', color: 'Red' } },
      'Green $pixelKey': { capability: { type: 'ColorIntensity', color: 'Green' } },
      'Blue $pixelKey': { capability: { type: 'ColorIntensity', color: 'Blue' } }
    },
    modes: [
      { name: '10ch', channels: ['Dimmer', { insert: 'matrixChannels', repeatFor: 'eachPixelABC', channelOrder: 'perPixel', templateChannels: ['Red $pixelKey', 'Green $pixelKey', 'Blue $pixelKey'] }] }
    ]
  }

  it('gives each pixel its own head and the shared dimmer becomes the master', () => {
    const type = fixtureTypeFromOfl('test/bar', 'Test', bar, 0)
    expect(type.channels.length).toBe(10)
    expect(type.heads!.map((h) => h.role)).toEqual(['master', 'pixel', 'pixel', 'pixel'])
    expect(type.spec!.look).toBe('bar')
    const levels = new Uint8Array(512)
    levels.set([255, 255, 0, 0, 0, 255, 0, 0, 0, 255], 0) // master full; pixel 1 red, 2 green, 3 blue
    const [, p1, p2, p3] = decodeHeads(type, levels, 1, 0)
    expect(p1.color).toEqual([1, 0, 0])
    expect(p2.color).toEqual([0, 1, 0])
    expect(p3.color).toEqual([0, 0, 1])
    levels[0] = 0
    expect(decodeHeads(type, levels, 1, 0)[1].intensity).toBe(0)
  })
})

describe('multi-effect bars (GigBAR 2)', () => {
  const fx = library.fixtures['chauvet-dj/gigbar-2']
  const type = fixtureTypeFromOfl('chauvet-dj/gigbar-2', 'Chauvet DJ', fx, 0)

  it('names its parts by what they are', () => {
    const roles = Object.fromEntries(type.heads!.map((h) => [h.name, h.role]))
    expect(roles['Derby 1']).toBe('derby')
    expect(roles['Laser']).toBe('laser')
    expect(type.spec!.look).toBe('gigbar')
  })

  it('is completely dark with every channel at 0', () => {
    const states = decodeHeads(type, new Uint8Array(512), 1, 0)
    expect(states.every((s) => s.intensity === 0)).toBe(true)
  })

  it('shows a derby colour preset, mixing "Red + Green"', () => {
    const levels = new Uint8Array(512)
    const derby = type.heads!.findIndex((h) => h.name === 'Derby 1')
    levels[type.heads![derby].ch.colorWheel!.coarse] = 110 // 100-124: Red + Green
    const s = decodeHeads(type, levels, 1, 0)[derby]
    expect(s.intensity).toBe(1)
    expect(s.color).toEqual([1, 1, 0])
  })
})

describe('gobos (Intimidator Spot 260)', () => {
  const fx = library.fixtures['chauvet-dj/intimidator-spot-260']
  const type = fixtureTypeFromOfl('chauvet-dj/intimidator-spot-260', 'Chauvet DJ', fx, 0)
  const at = (gobo: number, rotation: number) => {
    const levels = new Uint8Array(512)
    levels.set([128, 0, 128, 0, 0, 0, gobo, rotation, 0, 0, 255, 230], 0)
    return decodeHeads(type, levels, 1, 0)[0]
  }

  it('picks the gobo slot from the wheel ranges', () => {
    expect(at(3, 0).gobo).toBe(0) // 0-7: open
    expect(at(20, 0).gobo).toBe(2) // 16-23: slot 3 on the wheel, the second gobo
    expect(at(60, 0).gobo).toBe(7) // 56-63: the last gobo
    expect(at(68, 0).gobo).toBe(7) // 64-71: that gobo, shaking
  })

  it('spins the gobo clockwise, then anticlockwise, from the rotation channel', () => {
    expect(at(20, 3).goboSpin).toBe(0) // 0-7: no rotation
    expect(at(20, 60).goboSpin).toBeGreaterThan(0) // 8-119: clockwise
    expect(at(20, 200).goboSpin).toBeLessThan(0) // 120-231: anticlockwise
  })
})

describe('Both Lighting fixtures (from the manuals)', () => {
  const both = Object.keys(library.fixtures).filter((k) => k.startsWith('both-lighting/'))
  const type = (slug: string, mode = 0) => fixtureTypeFromOfl(`both-lighting/${slug}`, 'Both Lighting', library.fixtures[`both-lighting/${slug}`], mode)

  it('has the Both Lighting range', () => {
    expect(both.length).toBeGreaterThanOrEqual(20)
    for (const k of ['mh-150', 'bpm-spots', 'aura-1915', 'spider-wash', 'ir-4', '360-tubes', 'sq-bar9', 'fx-pix-bar-1000']) expect(both).toContain(`both-lighting/${k}`)
  })

  it('MH-150 16-channel: colour wheel slot 2 is red, 0-7 strobe is open, pan 540°', () => {
    const t = type('mh-150', 3)
    expect(t.channels.length).toBe(16)
    expect(t.panRange).toBe(540)
    const levels = new Uint8Array(512)
    levels.set([128, 0, 128, 0, 0, 255, 0, 20], 0) // dimmer full, strobe open, colour 16-31
    const [h] = decodeHeads(t, levels, 1, 0)
    expect(h.intensity).toBe(1)
    expect(h.color[0]).toBeGreaterThan(0.9)
    expect(h.color[2]).toBeLessThan(0.1)
  })

  it('BPM-Spots has its RGB halo ring as its own part', () => {
    const t = type('bpm-spots')
    expect(t.channels.length).toBe(22)
    expect(t.heads!.find((h) => h.role === 'halo')?.ch.red).toBeTruthy()
  })

  it('pixel modes get one head per pixel', () => {
    expect(type('360-tubes', 4).heads!.filter((h) => h.role === 'pixel').length).toBe(32)
    expect(type('splash-pro', 2).heads!.filter((h) => h.role === 'pixel').length).toBe(7)
    const bar = type('fx-pix-bar-1000', 1)
    expect(bar.channels.length).toBe(75)
    expect(bar.heads!.filter((h) => h.role === 'strobe').length).toBe(13)
    expect(bar.heads!.filter((h) => /warm/i.test(h.name)).length).toBe(12)
  })
})

describe('Play demo on library fixtures', () => {
  it('lights every mode of every Both Lighting fixture', async () => {
    const { registerFixtureTypes } = await import('../src/renderer/src/model/fixtureTypes')
    const { runDemo } = await import('../src/renderer/src/state/demo')
    const { dmxBus } = await import('../src/renderer/src/state/dmxBus')
    const dark: string[] = []
    for (const entry of libraryIndex(library).filter((e) => e.key.startsWith('both-lighting/'))) {
      library.fixtures[entry.key].modes.forEach((_, mode) => {
        const type = fixtureTypeFromOfl(entry.key, entry.manufacturer, library.fixtures[entry.key], mode)
        if (!type.heads?.some((h) => h.role !== 'master' && (h.ch.dimmer || h.ch.red || h.ch.white || h.ch.colorWheel || h.ch.shutter))) return
        registerFixtureTypes([type])
        dmxBus.clearFaders()
        dmxBus.setPreview(true)
        const fixture = { id: 'f', name: 'f', typeId: type.id, universe: 1, address: 1 } as never
        let brightest = 0
        for (let t = 0; t < 4; t += 0.05) {
          runDemo({ fixtures: [fixture] } as never, t)
          brightest = Math.max(brightest, ...decodeHeads(type, dmxBus.levels(1), 1, t).map((h) => h.intensity))
        }
        if (brightest < 0.3) dark.push(`${entry.key} mode ${mode}`)
      })
    }
    dmxBus.setPreview(false)
    expect(dark).toEqual([])
  })
})
