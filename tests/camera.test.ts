import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { boundsOf, fitCamera, type Bounds } from '../src/renderer/src/model/cameraFit'
import { defaultProject } from '../src/renderer/src/model/project'
import { settle } from '../src/renderer/src/model/physics'

/** Every corner of the box on screen (inside -1..1), and the box not tiny on screen. */
function check(b: Bounds, dir: [number, number, number], aspect: number) {
  const fit = fitCamera(b, dir, 45, aspect)
  const cam = new THREE.PerspectiveCamera(45, aspect, 0.1, 500)
  cam.position.set(...fit.position)
  cam.lookAt(new THREE.Vector3(...fit.target))
  cam.updateMatrixWorld()
  let widest = 0
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Vector3(i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]).project(cam)
    expect(Math.abs(p.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(p.y)).toBeLessThanOrEqual(1)
    widest = Math.max(widest, Math.abs(p.x), Math.abs(p.y))
  }
  // Fills a good part of the view: not "zoomed right out".
  expect(widest).toBeGreaterThan(0.6)
}

describe('framing the show', () => {
  it('fits the whole show in view from every preset, in wide and tall windows', () => {
    const b = boundsOf(settle(defaultProject()), 'all')!
    for (const dir of [[0.3, 0.42, 1], [0, 0.12, 1], [0, 1, 0.035], [-1, 0.18, 0.04], [1, 0.18, 0.04]] as Array<[number, number, number]>) {
      for (const aspect of [0.7, 1.6, 2.4]) check(b, dir, aspect)
    }
  })

  it('measures fixtures and objects, not their beams', () => {
    const b = boundsOf(settle(defaultProject()), 'all')!
    // The default rig: a 14 m riser, a 6.5 m truss. Beams would reach far beyond.
    expect(b.max[1]).toBeLessThan(8)
    expect(b.max[0] - b.min[0]).toBeLessThan(16)
  })

  it('frames a single small fixture closely', () => {
    const b = boundsOf(settle(defaultProject()), ['par-1'])!
    const fit = fitCamera(b, [0.3, 0.42, 1], 45, 1.6)
    const d = Math.hypot(fit.position[0] - fit.target[0], fit.position[1] - fit.target[1], fit.position[2] - fit.target[2])
    expect(d).toBeLessThan(3)
  })
})
