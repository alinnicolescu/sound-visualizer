import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { fixtureTypeFromGdtf, matchGdtfName, mergeShow, patchCsv, readMvr, showFromMvr, toMvr } from '../src/renderer/src/model/exchange'
import { defaultProject, findOverlaps, type Project } from '../src/renderer/src/model/project'
import { settle } from '../src/renderer/src/model/physics'
import { fixtureTypeFromOfl, libraryIndex, type OflLibrary } from '../src/renderer/src/model/oflImport'
import { registerFixtureTypes } from '../src/renderer/src/model/fixtureTypes'

const library: OflLibrary = JSON.parse(readFileSync('resources/library/ofl.json', 'utf8'))
const entries = libraryIndex(library)
const typeFor = (key: string, mode: string) => {
  const fx = library.fixtures[key]
  const i = Math.max(0, fx.modes.findIndex((m) => m.name === mode || `${m.shortName}` === mode))
  return fixtureTypeFromOfl(key, entries.find((e) => e.key === key)!.manufacturer, fx, i)
}

function showWithTotem(): Project {
  const p = settle(defaultProject())
  const totem = { id: 'st-t1', kind: 'totem' as const, name: 'Totem 6 ft', position: [-8, 0, 3] as [number, number, number], rotation: 0, params: { height: 1.83 } }
  const mover = { ...p.fixtures.find((f) => f.id === 'spot-1')!, id: 'm1', name: 'Totem mover', universe: 1, address: 1, mount: { structure: 'st-t1', point: 'top' } }
  return settle({ ...p, structures: [...p.structures!, totem], fixtures: [...p.fixtures, mover] })
}

describe('merging shows', () => {
  it('adds the other show, re-patching clashes and reusing identical set pieces', () => {
    const current = settle(defaultProject())
    const incoming = showWithTotem()
    const { project, fixtures, structures, repatched } = mergeShow(current, incoming)
    expect(fixtures).toBe(incoming.fixtures.length)
    // The default stage, truss and booth are already here: only the totem is new.
    expect(structures).toBe(1)
    expect(repatched).toBeGreaterThan(0)
    expect(findOverlaps(project.fixtures)).toEqual([])
    const mover = project.fixtures.find((f) => f.name === 'Totem mover')!
    const totem = project.structures!.find((s) => s.id === mover.mount!.structure)!
    expect(totem.kind).toBe('totem')
    expect(settle(project).fixtures.find((f) => f.name === 'Totem mover')!.position[1]).toBeGreaterThan(1.8)
  })
})

describe('MVR', () => {
  it('round-trips a show through MVR without losing anything', async () => {
    const show = showWithTotem()
    const bytes = await toMvr(show, { model: async () => new Uint8Array([1, 2, 3]) })
    const files = unzipSync(bytes)
    expect(Object.keys(files)).toContain('GeneralSceneDescription.xml')
    expect(Object.keys(files)).toContain('st-t1.glb')
    const xml = strFromU8(files['GeneralSceneDescription.xml'])
    expect(xml).toContain('<GDTFSpec>Generic@Moving_Head_Spot.gdtf</GDTFSpec>')
    // Universe 2, address 1 → absolute 513.
    expect(xml).toMatch(/<Fixture name="Totem mover"[\s\S]*?<Address break="0">513<\/Address>/)
    const back = showFromMvr(readMvr(bytes), 'x', entries, typeFor)
    expect(back.project.fixtures).toEqual(show.fixtures)
    expect(back.project.structures).toEqual(show.structures)
  })

  it('reads fixtures from an MVR made elsewhere: position, patch, hanging', async () => {
    const show = showWithTotem()
    const bytes = await toMvr(show)
    // Take our own data out, like a file from another program.
    const files = unzipSync(bytes)
    const xml = strFromU8(files['GeneralSceneDescription.xml']).replace(/<UserData>[\s\S]*?<\/UserData>/, '')
    const foreign = zipSync({ 'GeneralSceneDescription.xml': strToU8(xml) })
    const scene = readMvr(foreign)
    expect(scene.show).toBeUndefined()
    expect(scene.fixtures.length).toBe(show.fixtures.length)
    const spot = scene.fixtures.find((f) => f.name === 'Spot 1')!
    const original = show.fixtures.find((f) => f.name === 'Spot 1')!
    expect(spot.hanging).toBe(true)
    expect(spot.position[0]).toBeCloseTo(original.position[0])
    expect(spot.position[1]).toBeCloseTo(original.position[1])
    expect(spot.position[2]).toBeCloseTo(original.position[2])
    expect([spot.universe, spot.address]).toEqual([original.universe, original.address])
    const mover = scene.fixtures.find((f) => f.name === 'Totem mover')!
    expect([mover.universe, mover.address]).toEqual([1, 1])
  })

  it('matches GDTF names to the library', () => {
    expect(matchGdtfName(entries, 'Chauvet_DJ@Intimidator_Spot_260.gdtf')?.key).toBe('chauvet-dj/intimidator-spot-260')
    expect(matchGdtfName(entries, 'Both_Lighting@MH-150_Beam_Moving_Head.gdtf')?.key).toBe('both-lighting/mh-150')
  })

  it('builds a fixture type from a GDTF file inside the MVR', () => {
    const description = `<?xml version="1.0"?><GDTF DataVersion="1.2"><FixtureType Name="Test" LongName="Test Spot" Manufacturer="Acme">
      <DMXModes><DMXMode Name="Basic"><DMXChannels>
        <DMXChannel Offset="1,2"><LogicalChannel Attribute="Pan"/></DMXChannel>
        <DMXChannel Offset="3,4"><LogicalChannel Attribute="Tilt"/></DMXChannel>
        <DMXChannel Offset="5"><LogicalChannel Attribute="Dimmer"/></DMXChannel>
        <DMXChannel Offset="6"><LogicalChannel Attribute="Color1"/></DMXChannel>
        <DMXChannel Offset="8"><LogicalChannel Attribute="Gobo1"/></DMXChannel>
      </DMXChannels></DMXMode></DMXModes></FixtureType></GDTF>`
    const gdtf = zipSync({ 'description.xml': strToU8(description) })
    const t = fixtureTypeFromGdtf(gdtf, 'Basic')!
    expect(t.channels).toEqual(['pan', 'panFine', 'tilt', 'tiltFine', 'dimmer', 'colorWheel', 'reserved', 'gobo'])
    expect(t.body).toBe('movingHead')
    expect(t.manufacturer).toBe('Acme')
  })
})

describe('CSV patch list', () => {
  it('lists every fixture by patch, with what it is attached to', () => {
    const show = showWithTotem()
    registerFixtureTypes(show.fixtureTypes)
    const csv = patchCsv(show).trim().split('\n')
    expect(csv[0]).toMatch(/^Name,Manufacturer,Fixture,Channels,Universe,Address/)
    expect(csv.length).toBe(show.fixtures.length + 1)
    expect(csv.find((r) => r.startsWith('Totem mover'))).toMatch(/,2,1,16,.*Totem 6 ft \(Top plate\)/)
  })
})
