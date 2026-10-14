import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { useStore } from '../src/renderer/src/state/store'
import { libraryIndex, type OflLibrary } from '../src/renderer/src/model/oflImport'
import { buildWithClaude, findFixtures, quickPlan, runQuickPlan, runTool, type ClaudeTransport } from '../src/renderer/src/state/showBuilder'
import { defaultProject, findOverlaps } from '../src/renderer/src/model/project'
import { settle } from '../src/renderer/src/model/physics'
import { getFixtureType } from '../src/renderer/src/model/fixtureTypes'

const library: OflLibrary = JSON.parse(readFileSync('resources/library/ofl.json', 'utf8'))
const lib = { library, entries: libraryIndex(library) }
const project = () => useStore.getState().project

beforeEach(() => useStore.setState({ project: settle(defaultProject()), past: [], future: [], selection: [] }))

describe('finding fixtures from a description', () => {
  it('finds the Both Lighting 100 W moving head', () => {
    const [best] = findFixtures(lib, 'both lighting 100 watt moving head')
    expect(best.key).toBe('both-lighting/bpm-spots')
  })
  it('finds by model name', () => {
    expect(findFixtures(lib, 'MH-150')[0].key).toBe('both-lighting/mh-150')
    expect(findFixtures(lib, 'chauvet intimidator spot 260')[0].key).toBe('chauvet-dj/intimidator-spot-260')
  })
})

describe('the built-in reader', () => {
  const request =
    'I want two both lighting moving heads, the 100 watt moving heads, each on totems that are 6 feet long. One should be pan, and inverse of the other. One on one side of a stage versus the other one on the other side of the stage.'

  it('builds the example: two 100 W movers on 6 ft totems either side of the stage, one with pan inverted', () => {
    const plan = quickPlan(request, lib)!
    expect(plan).not.toBeNull()
    expect(plan.understood.join(' ')).toMatch(/2 × Both Lighting BPM-Spots/)
    const before = project().fixtures.length
    const pastBefore = useStore.getState().past.length
    const ids = runQuickPlan(plan, lib, 'Build')
    expect(ids.length).toBe(2)
    const added = project().fixtures.filter((f) => ids.includes(f.id))
    expect(project().fixtures.length).toBe(before + 2)
    // Each on its own 6 ft totem, on opposite sides of the stage.
    const totems = added.map((f) => project().structures!.find((s) => s.id === f.mount?.structure)!)
    expect(totems.map((t) => t.kind)).toEqual(['totem', 'totem'])
    expect(totems[0].id).not.toBe(totems[1].id)
    for (const t of totems) expect(t.params.height).toBeCloseTo(6 * 0.3048)
    const [left, right] = [...added].sort((a, b) => a.position[0] - b.position[0])
    expect(left.position[0]).toBeLessThan(-7)
    expect(right.position[0]).toBeGreaterThan(7)
    expect(left.position[1]).toBeCloseTo(6 * 0.3048 + 0.012, 2)
    // A mirrored pair: one pans the other way.
    expect([left.invertPan, right.invertPan]).toEqual([undefined, true])
    expect(getFixtureType(left.typeId).manufacturer).toBe('Both Lighting')
    expect(findOverlaps(project().fixtures)).toEqual([])
    // The whole build is one undo step.
    expect(useStore.getState().past.length).toBe(pastBefore + 1)
    useStore.getState().undo()
    expect(project().fixtures.length).toBe(before)
  })

  it('hangs fixtures on the truss', () => {
    const ids = runQuickPlan(quickPlan('four chauvet intimidator spot 260 on the truss', lib)!, lib, 'Build')
    expect(ids.length).toBe(4)
    for (const id of ids) expect(project().fixtures.find((f) => f.id === id)!.mounting).toBe('hanging')
  })

  it('leaves requests it cannot read to Claude', () => {
    expect(quickPlan('make it look like a festival', lib)).toBeNull()
  })
})

describe('Claude building with the tools', () => {
  it('runs the tool calls it asks for, and it is one undo step', async () => {
    let turn = 0
    const send: ClaudeTransport = async (body) => {
      const b = body as { messages: Array<{ content: unknown }>; tools: unknown[] }
      expect(b.tools.length).toBeGreaterThan(5)
      turn++
      if (turn === 1) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'add_structure', input: { kind: 'flexstand', x_ft: -10, z_ft: 5 } }] }
      if (turn === 2) {
        const result = JSON.parse((b.messages.at(-1)!.content as Array<{ content: string }>)[0].content)
        return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't2', name: 'add_fixtures', input: { library_key: 'both-lighting/mh-150', on: { structure_id: result.id } } }] }
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Added an MH-150 on a FLEXstand.' }] }
    }
    const pastBefore = useStore.getState().past.length
    const steps: string[] = []
    const reply = await buildWithClaude('an mh-150 on a flexstand stage left', lib, send, (s) => steps.push(s))
    expect(reply).toBe('Added an MH-150 on a FLEXstand.')
    const added = project().fixtures.at(-1)!
    expect(project().structures!.find((s) => s.id === added.mount?.structure)?.kind).toBe('flexstand')
    expect(useStore.getState().past.length).toBe(pastBefore + 1)
    expect(steps.length).toBe(2)
  })

  it('reports tool errors back to Claude instead of failing', () => {
    expect(() => runTool(lib, { name: 'add_structure', input: { kind: 'spaceship' } })).toThrow(/Unknown kind/)
  })
})

describe('ready-made shows', async () => {
  const { TEMPLATES, runTemplate } = await import('../src/renderer/src/state/shows')
  for (const t of TEMPLATES) {
    it(`builds "${t.name}" without problems, as one undo step`, () => {
      const pastBefore = useStore.getState().past.length
      expect(runTemplate(t, lib)).toEqual([])
      expect(useStore.getState().past.length).toBe(pastBefore + 1)
      expect(findOverlaps(project().fixtures)).toEqual([])
      if (t.id === 'mobile') {
        const movers = project().fixtures.filter((f) => f.typeId.includes('bpm-spots'))
        expect(movers.length).toBe(2)
        expect(movers.every((f) => f.mount && project().structures!.find((s) => s.id === f.mount!.structure)!.kind === 'totem')).toBe(true)
        expect(movers.filter((f) => f.invertPan).length).toBe(1)
      }
      if (t.id === 'club') {
        expect(project().fixtures.filter((f) => f.mounting === 'hanging').length).toBe(4)
        // The booth stands on the stage.
        const booth = project().structures!.find((s) => s.kind === 'djBooth')!
        expect(booth.position[1]).toBeCloseTo(2 * 0.3048, 2)
      }
    })
  }
})

describe('tube stands from a description', () => {
  it('puts each 360 Tube on its own tube stand', () => {
    const plan = quickPlan('four both lighting 360 tubes on 6 ft tube stands', lib)!
    expect(plan.understood.join(' ')).toMatch(/4 × Both Lighting 360 Tube/)
    const ids = runQuickPlan(plan, lib, 'Build')
    expect(ids.length).toBe(4)
    const stands = new Set(ids.map((id) => project().fixtures.find((f) => f.id === id)!.mount?.structure))
    expect(stands.size).toBe(4)
    for (const s of stands) expect(project().structures!.find((x) => x.id === s)!.kind).toBe('tubeStand')
  })
})
