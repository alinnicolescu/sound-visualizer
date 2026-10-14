import { describe, expect, it } from 'vitest'
import { defaultProject, findOverlaps, fitsInUniverse, nextFreeAddress, type Fixture } from '../src/renderer/src/model/project'

const spot = (id: string, universe: number, address: number): Fixture => ({
  id, name: id, typeId: 'generic-spot-16', universe, address, position: [0, 0, 0], mounting: 'hanging', aimTilt: 0
})

describe('patch', () => {
  it('finds two fixtures sharing channels', () => {
    const overlaps = findOverlaps([spot('a', 0, 1), spot('b', 0, 10)])
    expect(overlaps).toHaveLength(1)
  })

  it('allows touching fixtures and other universes', () => {
    expect(findOverlaps([spot('a', 0, 1), spot('b', 0, 17), spot('c', 1, 1)])).toHaveLength(0)
  })

  it('knows when a fixture runs past channel 512', () => {
    expect(fitsInUniverse(spot('a', 0, 497))).toBe(true)
    expect(fitsInUniverse(spot('a', 0, 498))).toBe(false)
  })

  it('finds the next free address', () => {
    expect(nextFreeAddress([spot('a', 0, 1), spot('b', 0, 33)], 0, 16)).toBe(17)
    expect(nextFreeAddress([spot('a', 0, 1), spot('b', 0, 17)], 0, 16)).toBe(33)
  })

  it('ships a default rig with no clashes', () => {
    expect(findOverlaps(defaultProject().fixtures)).toHaveLength(0)
  })
})
