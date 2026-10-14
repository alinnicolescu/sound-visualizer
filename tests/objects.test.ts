import { beforeEach, describe, expect, it, vi } from 'vitest'

// The gobo texture is drawn on a canvas, which the test runner doesn't have.
vi.mock('../src/renderer/src/three/gobos', async (load) => {
  const THREE = await import('three')
  return { ...(await load<object>()), goboAtlas: () => new THREE.Texture() }
})
import { readFileSync } from 'node:fs'
import { useStore } from '../src/renderer/src/state/store'
import { addLibraryFixtures, addStructure, alignSelection, lineUpSelection, mountFixtures, moveSelection, placeSelection, spaceSelection } from '../src/renderer/src/state/commands'
import { defaultProject } from '../src/renderer/src/model/project'
import { settle } from '../src/renderer/src/model/physics'
import { FT, footprint, heightOf, mountPoints, STRUCTURE_KINDS, STRUCTURE_PRESETS, type StructureKind } from '../src/renderer/src/model/structures'
import { stageArea, unitsOf } from '../src/renderer/src/model/arrange'
import { fixtureTypeFromOfl, type OflLibrary } from '../src/renderer/src/model/oflImport'
import { buildStructure } from '../src/renderer/src/three/structures'

const state = () => useStore.getState().project
const fixture = (id: string) => state().fixtures.find((f) => f.id === id)!
const piece = (id: string) => state().structures!.find((s) => s.id === id)!
const lib: OflLibrary = JSON.parse(readFileSync('resources/library/ofl.json', 'utf8'))
const type = (key: string) => fixtureTypeFromOfl(key, 'x', lib.fixtures[key], 0)

/** An empty room with one 16 × 8 ft stage, 2 ft high, centred at the back. */
beforeEach(() => {
  useStore.setState({ project: settle({ ...defaultProject(), fixtures: [], structures: [] }), past: [], future: [], selection: [] })
  addStructure('stage', { width: 16 * FT, depth: 8 * FT, height: 2 * FT, stairs: false }, { at: [0, 0, -2], name: 'Stage' })
})
const stageId = () => state().structures!.find((s) => s.name === 'Stage')!.id

describe('moving things that belong together', () => {
  it('grabbing a tube on a stand moves the stand, and the tube stays on it', () => {
    const stand = addStructure('tubeStand', { height: 4 * FT }, { at: [8, 0, 3] })
    const [tube] = addLibraryFixtures(type('both-lighting/360-tubes'), 1, { at: [7, 0.1, 3] })
    expect(mountFixtures([tube], stand, 'top')).toBe(true)
    moveSelection([tube], [1, 0, 2])
    expect(piece(stand).position[0]).toBeCloseTo(9)
    expect(piece(stand).position[2]).toBeCloseTo(5)
    expect(fixture(tube).mount?.structure).toBe(stand)
    expect(fixture(tube).position[0]).toBeCloseTo(9)
    // Selecting both (a box around them) does the same, once.
    moveSelection([tube, stand], [1, 0, 0])
    expect(piece(stand).position[0]).toBeCloseTo(10)
  })

  it('moving the stage brings what stands on it, and leaves the rest', () => {
    const sub = addStructure('subStack', { count: 2 }, { at: [2, 0, -2] })
    const top = addStructure('speakerBox', { size: 12 }, { at: [2, 0, -2] })
    const elsewhere = addStructure('speakerOnPole', {}, { at: [9, 0, 4] })
    const [par] = addLibraryFixtures(type('chauvet-dj/slimpar-t12-bt'), 1, { at: [-1, 0.1, -2] })
    expect(piece(top).position[1]).toBeGreaterThan(piece(sub).position[1]) // the top stands on the subs
    expect(fixture(par).position[1]).toBeCloseTo(2 * FT, 2) // the par stands on the stage
    moveSelection([stageId()], [0, 0, -1])
    expect(piece(sub).position[2]).toBeCloseTo(-3)
    expect(piece(top).position[2]).toBeCloseTo(-3)
    expect(fixture(par).position[2]).toBeCloseTo(-3)
    expect(piece(elsewhere).position[2]).toBeCloseTo(4)
  })
})

describe('one-click arranging', () => {
  it('lines up stands across the back of the stage with equal gaps', () => {
    const ids = [-3, 1, 0.5, 4].map((x) => addStructure('totem', { height: 6 * FT }, { at: [x, 0, 3] }))
    expect(lineUpSelection(ids, 'back')).toBe(true)
    const area = stageArea(state(), new Set(ids))
    const units = unitsOf(state(), ids).sort((a, b) => a.minX - b.minX)
    const gaps = units.slice(1).map((u, i) => u.minX - units[i].maxX)
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 2)
    expect(units[0].minX).toBeGreaterThanOrEqual(area.minX)
    expect(units.at(-1)!.maxX).toBeLessThanOrEqual(area.maxX + 1e-3)
    for (const u of units) expect(u.minZ).toBeCloseTo(area.minZ + 0.3, 2)
    // And they're on the stage now.
    for (const id of ids) expect(piece(id).position[1]).toBeCloseTo(2 * FT, 2)
  })

  it('moves a group to the front of the stage, keeping its shape', () => {
    const a = addStructure('speakerOnPole', {}, { at: [-1, 0, 5] })
    const b = addStructure('speakerOnPole', {}, { at: [2, 0, 6] })
    const dx = piece(b).position[0] - piece(a).position[0]
    const dz = piece(b).position[2] - piece(a).position[2]
    placeSelection([a, b], 'front')
    expect(piece(b).position[0] - piece(a).position[0]).toBeCloseTo(dx)
    expect(piece(b).position[2] - piece(a).position[2]).toBeCloseTo(dz)
    const area = stageArea(state(), new Set([a, b]))
    expect(Math.max(...unitsOf(state(), [a, b]).map((u) => u.maxZ))).toBeCloseTo(area.maxZ - 0.3, 2)
  })

  it('aligns fronts and evens out gaps between mixed objects and fixtures', () => {
    const t = addStructure('totem', {}, { at: [-4, 0, 4] })
    const c = addStructure('highTop', {}, { at: [-1, 0, 5] })
    const [par] = addLibraryFixtures(type('chauvet-dj/slimpar-t12-bt'), 1, { at: [3.5, 0.1, 3] })
    expect(alignSelection([t, c, par], 'front')).toBe(true)
    const units = unitsOf(state(), [t, c, par])
    for (const u of units) expect(u.maxZ).toBeCloseTo(units[0].maxZ, 2)
    expect(spaceSelection([t, c, par], 'x')).toBe(true)
    const sorted = unitsOf(state(), [t, c, par]).sort((x, y) => x.minX - y.minX)
    expect(sorted[1].minX - sorted[0].maxX).toBeCloseTo(sorted[2].minX - sorted[1].maxX, 2)
  })
})

describe('every object', () => {
  it('has a sensible size, mount points on it, and a 3D model', () => {
    const kinds = Object.keys(STRUCTURE_KINDS) as StructureKind[]
    for (const kind of kinds) {
      const s = { id: `t-${kind}`, kind, name: kind, position: [0, 0, 0] as [number, number, number], rotation: 0, params: {} }
      const [w, d] = footprint(s)
      expect(w > 0 && d > 0 && Number.isFinite(w + d), kind).toBe(true)
      expect(heightOf(s) > 0, kind).toBe(true)
      for (const m of mountPoints(s)) expect(m.at.every(Number.isFinite), kind).toBe(true)
      const model = buildStructure(s)
      expect(model.children.length, kind).toBeGreaterThan(0)
    }
    // Every preset is a real kind, with a unique name.
    expect(new Set(STRUCTURE_PRESETS.map((p) => p.name)).size).toBe(STRUCTURE_PRESETS.length)
    for (const p of STRUCTURE_PRESETS) expect(STRUCTURE_KINDS[p.kind], p.name).toBeTruthy()
  })

  it('a flown line array hangs at its height even over the stage', () => {
    const arr = addStructure('lineArray', { count: 8, height: 5 }, { at: [0, 0, -2] })
    expect(piece(arr).position[1]).toBe(0)
  })
})
