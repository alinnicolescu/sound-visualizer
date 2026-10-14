/**
 * Moving heads must aim where the real fixture would: these drive the actual
 * 3D rig with DMX and measure where the beam points.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { fixtureTypeFromOfl, type OflLibrary } from '../src/renderer/src/model/oflImport'
import { decodeHeads } from '../src/renderer/src/model/heads'
import { FixtureRig } from '../src/renderer/src/three/fixtureRig'
import { projectors } from '../src/renderer/src/three/projectors'
import type { Fixture } from '../src/renderer/src/model/project'

const lib: OflLibrary = JSON.parse(readFileSync('resources/library/ofl.json', 'utf8'))
const type = fixtureTypeFromOfl('chauvet-dj/intimidator-spot-260', 'Chauvet DJ', lib.fixtures['chauvet-dj/intimidator-spot-260'], 0)

function aim(fixture: Partial<Fixture>, pan: number, tilt: number, extra: Record<number, number> = {}) {
  const f: Fixture = { id: 'a', name: 'a', typeId: type.id, universe: 0, address: 1, position: [0, 6, 0], mounting: 'hanging', aimTilt: 0, ...fixture }
  const rig = new FixtureRig(f, type)
  const scene = new THREE.Scene()
  scene.add(rig.root)
  const levels = new Uint8Array(512)
  // pan, pan fine, tilt, tilt fine, speed, colour, gobo, gobo rot, prism, zoom, dimmer, strobe
  levels.set([pan >> 8, pan & 255, tilt >> 8, tilt & 255, 0, 0, 0, 0, 0, 0, 255, 230], 0)
  for (const [ch, v] of Object.entries(extra)) levels[Number(ch)] = v
  let p = null as ReturnType<typeof projectors.brightest>[number] | null
  // Run 5 simulated seconds so the head reaches its target at its real speed.
  for (let t = 0; t < 5; t += 1 / 60) {
    projectors.begin()
    rig.update(decodeHeads(type, levels, 1, t), 1 / 60, 0.5, t)
    p = projectors.brightest()[0]
  }
  rig.dispose()
  return p!
}

const deg = (a: THREE.Vector3, b: THREE.Vector3) => (a.angleTo(b) * 180) / Math.PI
const DOWN = new THREE.Vector3(0, -1, 0)
const CENTRE = 32768

describe('moving head aim', () => {
  it('points straight down from a truss at pan and tilt 50%', () => {
    expect(deg(aim({}, CENTRE, CENTRE).direction, DOWN)).toBeLessThan(0.5)
  })

  it('tilts away from vertical by the tilt angle (270° over the full range)', () => {
    // A quarter of the way from centre to full: 270/2 × 0.5 = 67.5°
    const p = aim({}, CENTRE, CENTRE + 16384)
    expect(deg(p.direction, DOWN)).toBeCloseTo(67.5, 0)
  })

  it('pans the tilted beam around the fixture, not on the spot', () => {
    const tilt = CENTRE + 8192 // 33.75° off vertical
    const a = aim({}, CENTRE, tilt).direction
    const b = aim({}, CENTRE + 16384 / 2, tilt).direction // +67.5° of pan
    // Same angle from vertical...
    expect(deg(a, DOWN)).toBeCloseTo(deg(b, DOWN), 0)
    // ...but swung around the vertical axis by the pan angle.
    const flat = (v: THREE.Vector3) => new THREE.Vector3(v.x, 0, v.z).normalize()
    expect(deg(flat(a), flat(b))).toBeCloseTo(67.5, 0)
  })

  it('points straight up when standing on the floor', () => {
    expect(deg(aim({ mounting: 'floor', position: [0, 0, 0] }, CENTRE, CENTRE).direction, new THREE.Vector3(0, 1, 0))).toBeLessThan(0.5)
  })

  it('pans the other way when Invert pan is on', () => {
    const tilt = CENTRE + 8192
    const normal = aim({}, CENTRE + 8192, tilt).direction
    const inverted = aim({ invertPan: true }, CENTRE + 8192, tilt).direction
    expect(normal.x).toBeCloseTo(-inverted.x, 2)
    expect(normal.z).toBeCloseTo(inverted.z, 2)
  })
})

describe('things that turn only when told to', () => {
  it('keeps the prism still unless the prism rotation channel is up', () => {
    const levels = new Uint8Array(512)
    levels.set([128, 0, 128, 0, 0, 0, 0, 0, 200, 0, 255, 230], 0) // prism in, nothing else turning
    const s = decodeHeads(type, levels, 1, 0)[0]
    expect(s.prism).toBe(true)
    expect(s.prismSpin).toBe(0)
    expect(s.goboSpin).toBe(0)
  })

  it('slows the head down with the pan/tilt speed channel', () => {
    const levels = new Uint8Array(512)
    levels.set([128, 0, 128, 0, 0], 0)
    expect(decodeHeads(type, levels, 1, 0)[0].moveSpeed).toBe(1)
    levels[4] = 255 // slowest
    expect(decodeHeads(type, levels, 1, 0)[0].moveSpeed).toBeLessThan(0.1)
    // ...and the head really takes longer to get there: after 1 second it's still on its way.
    const f: Fixture = { id: 'a', name: 'a', typeId: type.id, universe: 0, address: 1, position: [0, 6, 0], mounting: 'hanging', aimTilt: 0 }
    const rig = new FixtureRig(f, type)
    levels.set([128, 0, 200, 0, 255, 0, 0, 0, 0, 0, 255, 230], 0)
    for (let t = 0; t < 1; t += 1 / 60) {
      projectors.begin()
      rig.update(decodeHeads(type, levels, 1, t), 1 / 60, 0.5, t)
    }
    const slow = projectors.brightest()[0].direction
    expect(deg(slow, DOWN)).toBeLessThan(30) // full speed would already be at ~76°
    rig.dispose()
  })
})

import { fixtureTypeFromMode } from '../src/renderer/src/model/soundswitchImport'

describe('SoundSwitch channel names', () => {
  it('tells gobo selection, gobo rotation, prism rotation and pan/tilt speed apart', () => {
    const attr = (code: number, name: string, ch: number) => ({ code, name, width: 1, coarse: ch, fine: ch })
    const t = fixtureTypeFromMode({
      definitionId: 1, definition: 'Test Spot', manufacturer: 'Test', universe: 0, address: 1, wheels: {},
      mode: {
        name: 'M', channels: 7, heads: [],
        attributes: [attr(3, 'Pan', 0), attr(4, 'Tilt', 1), attr(26, 'Rotating Gobo Wheel', 2), attr(27, 'Gobo Rotation', 3), attr(85, 'Prism Rotate', 4), attr(17, 'Pan/Tilt Speed', 5), attr(1, 'Dimmer', 6)]
      }
    })
    const ch = t.heads![0].ch
    expect(ch.gobo?.coarse).toBe(2)
    expect(ch.goboRotation?.coarse).toBe(3)
    expect(ch.prismRotation?.coarse).toBe(4)
    expect(ch.moveSpeed?.coarse).toBe(5)
  })
})
