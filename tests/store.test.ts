import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../src/renderer/src/state/store'
import { addFixture, deleteFixtures, updateFixtures } from '../src/renderer/src/state/commands'
import { defaultProject } from '../src/renderer/src/model/project'

describe('undo and redo', () => {
  beforeEach(() => useStore.setState({ project: defaultProject(), past: [], future: [], selection: [] }))

  it('undoes and redoes a command', () => {
    const before = useStore.getState().project.fixtures.length
    addFixture('generic-par-8')
    expect(useStore.getState().project.fixtures.length).toBe(before + 1)
    useStore.getState().undo()
    expect(useStore.getState().project.fixtures.length).toBe(before)
    useStore.getState().redo()
    expect(useStore.getState().project.fixtures.length).toBe(before + 1)
  })

  it('edits several fixtures in one step', () => {
    updateFixtures(['spot-1', 'spot-2'], 'Set universe', (f) => ({ ...f, universe: 3 }))
    const fixtures = useStore.getState().project.fixtures
    expect(fixtures.filter((f) => f.universe === 3)).toHaveLength(2)
    useStore.getState().undo()
    expect(useStore.getState().project.fixtures.filter((f) => f.universe === 3)).toHaveLength(0)
  })

  it('clears redo after a new change', () => {
    deleteFixtures(['spot-1'])
    useStore.getState().undo()
    addFixture('generic-spot-16')
    expect(useStore.getState().future).toHaveLength(0)
  })
})
