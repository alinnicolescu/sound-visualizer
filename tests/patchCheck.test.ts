import { describe, expect, it } from 'vitest'
import { defaultProject, type Fixture, type Project } from '../src/renderer/src/model/project'
import { fixFor, patchProblems } from '../src/renderer/src/model/patchCheck'
import { nextName } from '../src/renderer/src/state/commands'

const base = (): Project => defaultProject()
const copy = (f: Fixture, id: string, name: string): Fixture => ({ ...f, id, name })

describe('patch problems', () => {
  it('ignores copies that share a patch on purpose', () => {
    const p = base()
    const par = p.fixtures.find((f) => f.id === 'par-1')!
    p.fixtures.push(copy(par, 'c1', 'PAR 5'), copy(par, 'c2', 'PAR 6'))
    expect(patchProblems(p)).toEqual([])
  })

  it('reports a real clash once, counting copies with their original, and finds free channels', () => {
    const p = base()
    const spot = p.fixtures.find((f) => f.id === 'spot-1')!
    const par = p.fixtures.find((f) => f.id === 'par-1')!
    // Two PAR copies parked on the first spot's channels.
    p.fixtures.push({ ...copy(par, 'x1', 'Clash 1'), address: spot.address + 2 }, { ...copy(par, 'x2', 'Clash 2'), address: spot.address + 2 })
    const problems = patchProblems(p)
    expect(problems).toHaveLength(1)
    expect(problems[0].move.fixtures.map((f) => f.id).sort()).toEqual(['x1', 'x2'])
    const to = fixFor(p, problems[0])!
    // Moving there clears it.
    p.fixtures = p.fixtures.map((f) => (f.id === 'x1' || f.id === 'x2' ? { ...f, ...to } : f))
    expect(patchProblems(p)).toEqual([])
  })

  it('can keep a clash on purpose', () => {
    const p = base()
    const par = p.fixtures.find((f) => f.id === 'par-1')!
    p.fixtures.push({ ...copy(par, 'x1', 'Odd one'), typeId: 'generic-spot-16', address: par.address })
    // A 16-channel spot over two 8-channel PARs: two clashes, kept one at a time.
    const problems = patchProblems(p)
    expect(problems.map((x) => x.kind)).toEqual(['clash', 'clash'])
    p.ignoredClashes = [problems[0].key]
    expect(patchProblems(p)).toHaveLength(1)
    p.ignoredClashes = problems.map((x) => x.key)
    expect(patchProblems(p)).toEqual([])
  })

  it('reports fixtures past channel 512', () => {
    const p = base()
    p.fixtures[0] = { ...p.fixtures[0], address: 505 }
    expect(patchProblems(p).some((x) => x.kind === 'overflow')).toBe(true)
  })
})

describe('names for copies', () => {
  it('numbers copies instead of adding "copy"', () => {
    expect(nextName('Spot 1', ['Spot 1', 'Spot 2', 'Spot 3'])).toBe('Spot 4')
    expect(nextName('BO-IR4 LED Mini Spotlight 1 copy copy', ['BO-IR4 LED Mini Spotlight 1'])).toBe('BO-IR4 LED Mini Spotlight 2')
    expect(nextName('Totem 6 ft', ['Totem 6 ft'])).toBe('Totem 6 ft 2')
  })
})
