/**
 * Where to put the camera so a box fills the view without cutting anything off,
 * looking from a given direction. Plain maths, so it's easy to test.
 *
 * The box comes from the show's own data (fixture positions and sizes, object
 * footprints and heights), not from the 3D meshes: a beam is many metres long
 * and would otherwise make every view zoom right out.
 */
import type { Project, Vec3 } from './project'
import { getFixtureType } from './fixtureTypes'
import { footprint, heightOf, toWorld } from './structures'

export interface Bounds {
  min: Vec3
  max: Vec3
}

/** What an empty show frames: a stage-sized patch of the room. */
export const EMPTY_BOUNDS: Bounds = { min: [-4, 0, -3], max: [4, 3, 2] }

/** The box around these fixtures and objects (or everything), from the show's data. */
export function boundsOf(p: Project, ids: string[] | 'all'): Bounds | null {
  const pick = ids === 'all' ? null : new Set(ids)
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  const grow = (x: number, y: number, z: number) => {
    min[0] = Math.min(min[0], x)
    min[1] = Math.min(min[1], y)
    min[2] = Math.min(min[2], z)
    max[0] = Math.max(max[0], x)
    max[1] = Math.max(max[1], y)
    max[2] = Math.max(max[2], z)
  }
  for (const f of p.fixtures) {
    if (pick && !pick.has(f.id)) continue
    const [w, h, d] = getFixtureType(f.typeId).spec?.size ?? [0.3, 0.3, 0.3]
    const hanging = f.mounting === 'hanging'
    grow(f.position[0] - w / 2, f.position[1] - (hanging ? h : 0), f.position[2] - d / 2)
    grow(f.position[0] + w / 2, f.position[1] + (hanging ? 0 : h), f.position[2] + d / 2)
  }
  for (const s of p.structures ?? []) {
    if (pick && !pick.has(s.id)) continue
    const [w, d] = footprint(s)
    const top = s.position[1] + heightOf(s)
    for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
      const c = toWorld(s, [x, 0, z])
      grow(c[0], s.position[1], c[2])
      grow(c[0], top, c[2])
    }
  }
  if (!Number.isFinite(min[0])) return null
  return { min, max }
}

/**
 * Camera position and target to see `b` from `direction` (pointing from the
 * target towards the camera), with a little room around it. `fov` is the
 * vertical field of view in degrees, `aspect` width / height.
 */
export function fitCamera(b: Bounds, direction: Vec3, fov: number, aspect: number, margin = 0.86): { position: Vec3; target: Vec3 } {
  const len = Math.hypot(...direction) || 1
  const d: Vec3 = [direction[0] / len, direction[1] / len, direction[2] / len]
  // Camera axes: right = worldUp × d, up = d × right (looking straight down, use -z as up).
  let right: Vec3 = [d[2], 0, -d[0]]
  const rl = Math.hypot(...right)
  right = rl < 1e-6 ? [1, 0, 0] : [right[0] / rl, 0, right[2] / rl]
  const up: Vec3 = [d[1] * right[2] - d[2] * right[1], d[2] * right[0] - d[0] * right[2], d[0] * right[1] - d[1] * right[0]]
  const center: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
  const tanV = Math.tan((fov * Math.PI) / 360) * margin
  const tanH = tanV * Math.max(0.2, aspect)
  const dot = (a: Vec3, c: Vec3) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2]
  let distance = 2
  for (let i = 0; i < 8; i++) {
    const p: Vec3 = [(i & 1 ? b.max[0] : b.min[0]) - center[0], (i & 2 ? b.max[1] : b.min[1]) - center[1], (i & 4 ? b.max[2] : b.min[2]) - center[2]]
    // How far in front of the camera this corner is, for a camera `D` away: D - p·d.
    const toward = dot(p, d)
    distance = Math.max(distance, Math.abs(dot(p, right)) / tanH + toward, Math.abs(dot(p, up)) / tanV + toward, toward + 0.6)
  }
  return { target: center, position: [center[0] + d[0] * distance, center[1] + d[1] * distance, center[2] + d[2] * distance] }
}
