/**
 * Draws the set pieces in model/structures.ts: truss, totems, stands, stage
 * decks, tables, DJ booths, pipe and drape and speakers.
 *
 * Anything light lands on (stage tops, tables, scrims, skirts, drapes, the
 * booth facade) uses the room material, so beams and gobos show on it. Metal
 * and speaker cabinets use standard materials lit by the room's ambient light.
 * Truss is built as real box truss: four chords with diagonal lacing, merged
 * into one mesh per structure so a big rig stays cheap to draw.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { FT, mountPoints, paramsOf, pointAt, type Cover, type Structure } from '../model/structures'
import { createRoomMaterial } from './roomMaterial'

const metal = new THREE.MeshStandardMaterial({ color: 0xa4a7ad, roughness: 0.35, metalness: 0.6 })
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2b2f, roughness: 0.5, metalness: 0.5 })
const cabinet = new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.85 })
const grille = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.95 })
const seamLine = new THREE.LineBasicMaterial({ color: 0x111215, transparent: true, opacity: 0.7 })

const COVER_HEX: Record<Exclude<Cover, 'none'>, number> = { white: 0xe9e9ec, black: 0x161619 }

// Room materials are cheap to share: one per colour (and sidedness).
const roomMats = new Map<string, THREE.ShaderMaterial>()
function surface(hex: number, doubleSided = false): THREE.ShaderMaterial {
  const key = `${hex}:${doubleSided}`
  let m = roomMats.get(key)
  if (!m) {
    m = createRoomMaterial(hex, { doubleSided })
    roomMats.set(key, m)
  }
  return m
}
const cloth = (cover: Cover) => surface(COVER_HEX[cover === 'none' ? 'black' : cover], true)

/** Geometry pieces for one structure, grouped by material, merged at the end. */
class Parts {
  private byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
  add(material: THREE.Material, geometry: THREE.BufferGeometry): void {
    const list = this.byMaterial.get(material) ?? []
    // Merging needs the same attributes on every piece.
    const g = geometry.index ? geometry.toNonIndexed() : geometry
    if (g !== geometry) geometry.dispose()
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute('position').count) * 2), 2))
    list.push(g)
    this.byMaterial.set(material, list)
  }
  box(material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): void {
    this.add(material, new THREE.BoxGeometry(w, h, d).translate(x, y, z))
  }
  /** A tube between two points. */
  tube(material: THREE.Material, radius: number, a: THREE.Vector3, b: THREE.Vector3, sides = 8): void {
    const dir = b.clone().sub(a)
    const length = dir.length()
    if (length < 1e-4) return
    const g = new THREE.CylinderGeometry(radius, radius, length, sides, 1, false)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()))
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
    this.add(material, g)
  }
  build(group: THREE.Group): void {
    for (const [material, list] of this.byMaterial) {
      const merged = mergeGeometries(list, false)
      for (const g of list) g.dispose()
      if (!merged) continue
      group.add(new THREE.Mesh(merged, material))
    }
  }
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** Square box truss from a to b: four chords, diagonal lacing on each face, end frames. */
function truss(parts: Parts, a: THREE.Vector3, b: THREE.Vector3, size: number): void {
  const dir = b.clone().sub(a)
  const length = dir.length()
  if (length < 1e-3) return
  dir.normalize()
  const ref = Math.abs(dir.y) > 0.9 ? v(1, 0, 0) : v(0, 1, 0)
  const u = ref.clone().sub(dir.clone().multiplyScalar(ref.dot(dir))).normalize()
  const w = dir.clone().cross(u).normalize()
  const chordR = Math.max(0.012, size * 0.085)
  const laceR = chordR * 0.45
  const half = size / 2 - chordR
  const corner = (i: number, along: number) => {
    const su = i === 0 || i === 3 ? -1 : 1
    const sw = i < 2 ? -1 : 1
    return a.clone().addScaledVector(dir, along).addScaledVector(u, su * half).addScaledVector(w, sw * half)
  }
  for (let i = 0; i < 4; i++) parts.tube(metal, chordR, corner(i, 0), corner(i, length), 6)
  const bays = Math.max(1, Math.round(length / size))
  const bay = length / bays
  // Faces: corners (0,1), (1,2), (2,3), (3,0).
  for (let f = 0; f < 4; f++) {
    const c0 = f
    const c1 = (f + 1) % 4
    for (let k = 0; k < bays; k++) {
      const s = k * bay
      const e = (k + 1) * bay
      const [p, q] = k % 2 === 0 ? [corner(c0, s), corner(c1, e)] : [corner(c1, s), corner(c0, e)]
      parts.tube(metal, laceR, p, q, 4)
    }
    parts.tube(metal, laceR, corner(c0, 0), corner(c1, 0), 4)
    parts.tube(metal, laceR, corner(c0, length), corner(c1, length), 4)
  }
}

/** A drape with soft folds, `width` wide, hanging from `top` down to `bottom`, facing +z. */
function drape(width: number, bottom: number, top: number, depth = 0.035): THREE.BufferGeometry {
  const seg = Math.max(2, Math.ceil(width / 0.06))
  const g = new THREE.PlaneGeometry(width, top - bottom, seg, 1)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / 0.14) * Math.PI) * depth)
  g.computeVertexNormals()
  g.translate(0, (top + bottom) / 2, 0)
  return g
}

/** A skirt or drape around a w × d rectangle, from the floor up to `top`. */
function skirt(parts: Parts, material: THREE.Material, w: number, d: number, top: number, sides: Array<'front' | 'back' | 'left' | 'right'> = ['front', 'back', 'left', 'right']): void {
  const o = 0.015
  for (const side of sides) {
    const along = side === 'front' || side === 'back' ? w : d
    const g = drape(along, 0.005, top, 0.012)
    if (side === 'front') g.translate(0, 0, d / 2 + o)
    if (side === 'back') g.rotateY(Math.PI).translate(0, 0, -d / 2 - o)
    if (side === 'left') g.rotateY(-Math.PI / 2).translate(-w / 2 - o, 0, 0)
    if (side === 'right') g.rotateY(Math.PI / 2).translate(w / 2 + o, 0, 0)
    parts.add(material, g)
  }
}

function tripod(parts: Parts, spread: number, joint: number): void {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2
    parts.tube(darkMetal, 0.014, v(Math.cos(a) * spread, 0.01, Math.sin(a) * spread), v(0, joint, 0), 6)
  }
}

/** The 3D model of one structure, at the origin (the caller places and turns it). */
export function buildStructure(s: Structure): THREE.Group {
  const group = new THREE.Group()
  const p = paramsOf(s)
  const parts = new Parts()
  const t = p.truss
  const cover = p.cover ?? 'none'
  const lines: number[] = []

  switch (s.kind) {
    case 'totem': {
      parts.box(darkMetal, 24 * 0.0254, 0.012, 24 * 0.0254, 0, 0.006, 0)
      parts.box(darkMetal, 12 * 0.0254, 0.012, 12 * 0.0254, 0, p.height + 0.006, 0)
      if (cover === 'none') truss(parts, v(0, 0.012, 0), v(0, p.height, 0), t)
      else parts.box(cloth(cover), t + 0.05, p.height - 0.02, t + 0.05, 0, 0.012 + (p.height - 0.02) / 2, 0)
      break
    }
    case 'flexstand': {
      parts.box(darkMetal, 0.55, 0.012, 0.55, 0, 0.006, 0)
      const lower = Math.min(p.height - 0.1, 1.45)
      parts.tube(darkMetal, 0.024, v(0, 0.012, 0), v(0, lower, 0))
      parts.tube(darkMetal, 0.018, v(0, lower - 0.1, 0), v(0, p.height, 0))
      parts.add(darkMetal, new THREE.CylinderGeometry(0.06, 0.06, 0.012, 16).translate(0, p.height + 0.006, 0))
      if (cover !== 'none') parts.box(cloth(cover), 0.3, p.height - 0.05, 0.3, 0, 0.02 + (p.height - 0.05) / 2, 0)
      break
    }
    case 'tubeStand': {
      // Round cast-iron base, a pole, and a cup the tube's end sits in.
      parts.add(darkMetal, new THREE.CylinderGeometry(0.15, 0.15, 0.02, 24).translate(0, 0.01, 0))
      parts.tube(darkMetal, 0.012, v(0, 0.02, 0), v(0, p.height - 0.03, 0))
      parts.add(darkMetal, new THREE.CylinderGeometry(0.035, 0.03, 0.05, 16).translate(0, p.height - 0.015, 0))
      break
    }
    case 'tbar': {
      tripod(parts, 0.55, 0.75)
      parts.tube(darkMetal, 0.022, v(0, 0.3, 0), v(0, p.height, 0))
      parts.tube(darkMetal, 0.02, v(-p.width / 2, p.height, 0), v(p.width / 2, p.height, 0))
      break
    }
    case 'goalpost': {
      for (const x of [-p.width / 2, p.width / 2]) {
        parts.box(darkMetal, 0.6, 0.012, 0.6, x, 0.006, 0)
        truss(parts, v(x, 0.012, 0), v(x, p.height, 0), t)
      }
      truss(parts, v(-p.width / 2 + t / 2, p.height - t / 2, 0), v(p.width / 2 - t / 2, p.height - t / 2, 0), t)
      break
    }
    case 'trussBox': {
      const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
      for (const [sx, sz] of corners) {
        parts.box(darkMetal, 0.6, 0.012, 0.6, (sx * p.width) / 2, 0.006, (sz * p.depth) / 2)
        truss(parts, v((sx * p.width) / 2, 0.012, (sz * p.depth) / 2), v((sx * p.width) / 2, p.height, (sz * p.depth) / 2), t)
      }
      const y = p.height - t / 2
      for (const z of [-p.depth / 2, p.depth / 2]) truss(parts, v(-p.width / 2 + t / 2, y, z), v(p.width / 2 - t / 2, y, z), t)
      for (const x of [-p.width / 2, p.width / 2]) truss(parts, v(x, y, -p.depth / 2 + t / 2), v(x, y, p.depth / 2 - t / 2), t)
      break
    }
    case 'groundTruss': {
      truss(parts, v(-p.width / 2, t / 2, 0), v(p.width / 2, t / 2, 0), t)
      break
    }
    case 'stage': {
      const h = p.height
      const top = surface(0x2c2d31)
      if (h <= 0.16) {
        parts.box(top, p.width, h, p.depth, 0, h / 2, 0)
      } else {
        parts.box(top, p.width, 0.05, p.depth, 0, h - 0.025, 0)
        // Deck frames, and legs at every deck corner (4 ft grid) when there's no skirt to hide them.
        parts.box(darkMetal, p.width, 0.06, p.depth, 0, h - 0.08, 0)
        if (cover === 'none') {
          const nx = Math.max(1, Math.round(p.width / (4 * FT)))
          const nz = Math.max(1, Math.round(p.depth / (4 * FT)))
          for (let i = 0; i <= nx; i++) {
            for (let k = 0; k <= nz; k++) {
              const x = Math.min(p.width / 2 - 0.04, Math.max(-p.width / 2 + 0.04, -p.width / 2 + (i * p.width) / nx))
              const z = Math.min(p.depth / 2 - 0.04, Math.max(-p.depth / 2 + 0.04, -p.depth / 2 + (k * p.depth) / nz))
              parts.tube(darkMetal, 0.022, v(x, 0, z), v(x, h - 0.1, z), 6)
            }
          }
        } else {
          skirt(parts, cloth(cover), p.width, p.depth, h - 0.05)
        }
        if (p.stairs && h > 0.25) {
          const steps = Math.max(1, Math.round(h / 0.18) - 1)
          const rise = h / (steps + 1)
          const tread = 0.28
          const sw = Math.min(4 * FT, p.width * 0.6)
          for (let i = 0; i < steps; i++) {
            const y = rise * (steps - i)
            parts.box(top, sw, y, tread, 0, y / 2, p.depth / 2 + tread * i + tread / 2)
          }
        }
      }
      // Seams between the 4 × 4 / 4 × 8 ft decks.
      const y = h + 0.002
      const nx = Math.round(p.width / (4 * FT))
      const deck = Math.abs(p.depth / (8 * FT) - Math.round(p.depth / (8 * FT))) < 0.05 ? 8 * FT : 4 * FT
      const nz = Math.round(p.depth / deck)
      for (let i = 1; i < nx; i++) {
        const x = -p.width / 2 + (i * p.width) / nx
        lines.push(x, y, -p.depth / 2, x, y, p.depth / 2)
      }
      for (let k = 1; k < nz; k++) {
        const z = -p.depth / 2 + (k * p.depth) / nz
        lines.push(-p.width / 2, y, z, p.width / 2, y, z)
      }
      break
    }
    case 'table': {
      const topMat = cover === 'none' ? surface(0x7d6e5c) : surface(COVER_HEX[cover])
      parts.box(topMat, p.width, 0.03, p.depth, 0, p.height - 0.015, 0)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.tube(darkMetal, 0.013, v(sx * (p.width / 2 - 0.12), 0, sz * (p.depth / 2 - 0.08)), v(sx * (p.width / 2 - 0.12), p.height - 0.03, sz * (p.depth / 2 - 0.08)), 6)
      if (cover !== 'none') skirt(parts, cloth(cover), p.width, p.depth, p.height - 0.03, ['front', 'left', 'right'])
      break
    }
    case 'djBooth': {
      const h = p.height
      parts.box(surface(0x3a3c42), p.width, 0.04, p.depth, 0, h, 0)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.tube(darkMetal, 0.015, v(sx * (p.width / 2 - 0.05), 0, sz * (p.depth / 2 - 0.05)), v(sx * (p.width / 2 - 0.05), h - 0.02, sz * (p.depth / 2 - 0.05)), 6)
      if (cover !== 'none') {
        const facade = surface(COVER_HEX[cover], true)
        parts.box(facade, p.width, h, 0.02, 0, h / 2, p.depth / 2 + 0.01)
        for (const sx of [-1, 1]) parts.box(facade, 0.02, h, p.depth, (sx * p.width) / 2, h / 2, 0)
        // The facade's 30 in panel frames.
        const panels = Math.max(1, Math.round(p.width / (30 * 0.0254)))
        for (let i = 0; i <= panels; i++) {
          const x = -p.width / 2 + (i * p.width) / panels
          parts.box(darkMetal, 0.018, h, 0.024, x, h / 2, p.depth / 2 + 0.012)
        }
        parts.box(darkMetal, p.width, 0.02, 0.024, 0, h - 0.01, p.depth / 2 + 0.012)
        parts.box(darkMetal, p.width, 0.02, 0.024, 0, 0.01, p.depth / 2 + 0.012)
      }
      break
    }
    case 'pipeDrape': {
      const spans = Math.max(1, p.spans ?? 1)
      const total = spans * p.width
      for (let i = 0; i <= spans; i++) {
        const x = -total / 2 + i * p.width
        parts.box(darkMetal, 0.4, 0.008, 0.4, x, 0.004, 0)
        parts.tube(metal, 0.024, v(x, 0.008, 0), v(x, p.height, 0), 8)
      }
      parts.tube(metal, 0.018, v(-total / 2, p.height - 0.05, 0), v(total / 2, p.height - 0.05, 0), 8)
      if (cover !== 'none') parts.add(cloth(cover), drape(total, 0.02, p.height - 0.06, 0.04))
      break
    }
    case 'speakerColumn': {
      parts.box(cabinet, 0.36, 0.6, 0.46, 0, 0.3, 0)
      parts.box(grille, 0.3, 0.5, 0.005, 0, 0.3, 0.233)
      const columnTop = p.height
      const columnBottom = columnTop - 0.85
      parts.tube(darkMetal, 0.018, v(0, 0.6, 0), v(0, columnBottom, 0))
      parts.box(cabinet, 0.1, columnTop - columnBottom, 0.12, 0, (columnTop + columnBottom) / 2, 0)
      parts.box(grille, 0.08, columnTop - columnBottom - 0.04, 0.005, 0, (columnTop + columnBottom) / 2, 0.061)
      break
    }
    case 'speakerOnPole': {
      tripod(parts, 0.5, 0.65)
      parts.tube(darkMetal, 0.018, v(0, 0.3, 0), v(0, p.height - 0.35, 0))
      parts.box(cabinet, 0.42, 0.7, 0.38, 0, p.height, 0)
      parts.box(grille, 0.36, 0.62, 0.005, 0, p.height, 0.191)
      break
    }
    case 'sub': {
      parts.box(cabinet, p.width, p.height, p.depth, 0, p.height / 2, 0)
      parts.box(grille, p.width - 0.06, p.height - 0.06, 0.005, 0, p.height / 2, p.depth / 2 + 0.003)
      break
    }
  }
  parts.build(group)
  if (lines.length) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
    const seams = new THREE.LineSegments(g, seamLine)
    seams.raycast = () => {}
    group.add(seams)
  }
  group.traverse((o) => (o.userData.structureId = s.id))
  return group
}

/** What a structure's model depends on: rebuild only when this changes. */
export function shapeKey(s: Structure): string {
  return `${s.kind}:${JSON.stringify(paramsOf(s))}`
}

/** One structure in the scene: its model, placed and turned, and a selection outline. */
export class StructureRig {
  readonly root = new THREE.Group()
  readonly structureId: string
  key = ''
  private model: THREE.Group | null = null
  private outline: THREE.Box3Helper | null = null

  constructor(s: Structure) {
    this.structureId = s.id
    this.update(s)
  }

  update(s: Structure): void {
    const key = shapeKey(s)
    if (key !== this.key) {
      if (this.model) {
        this.root.remove(this.model)
        disposeGroup(this.model)
      }
      this.model = buildStructure(s)
      this.root.add(this.model)
      this.key = key
      if (this.outline) {
        this.setSelected(false)
        this.setSelected(true)
      }
    }
    this.root.position.set(...s.position)
    this.root.rotation.y = (s.rotation * Math.PI) / 180
  }

  setSelected(on: boolean): void {
    if (on && !this.outline && this.model) {
      // The model's pieces are built in its own space, so their bounds are the local box.
      const box = new THREE.Box3()
      this.model.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        o.geometry.computeBoundingBox()
        box.union(o.geometry.boundingBox!)
      })
      this.outline = new THREE.Box3Helper(box.expandByScalar(0.03), 0x4da3ff)
      this.outline.raycast = () => {}
      ;(this.outline.material as THREE.LineBasicMaterial).depthTest = false
      this.outline.renderOrder = 10
      this.root.add(this.outline)
    } else if (!on && this.outline) {
      this.root.remove(this.outline)
      this.outline.geometry.dispose()
      ;(this.outline.material as THREE.Material).dispose()
      this.outline = null
    }
  }

  dispose(): void {
    if (this.model) disposeGroup(this.model)
    this.setSelected(false)
  }
}

function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose()
    // Materials are shared between structures; they live as long as the app.
  })
}

/**
 * Every mount point in the scene, drawn faintly while you drag a fixture, so you
 * can see where it can go: dots for top plates, lines for bars and legs.
 */
export function mountGuides(structures: Structure[]): THREE.Group {
  const group = new THREE.Group()
  const segs: number[] = []
  const dots: number[] = []
  for (const s of structures) {
    const a = (s.rotation * Math.PI) / 180
    const world = (q: [number, number, number]) => {
      const c = Math.cos(a)
      const sn = Math.sin(a)
      return [s.position[0] + q[0] * c + q[2] * sn, s.position[1] + q[1], s.position[2] - q[0] * sn + q[2] * c]
    }
    for (const m of mountPoints(s)) {
      if (m.to) segs.push(...world(m.at), ...world(m.to))
      else dots.push(...world(pointAt(m)))
    }
  }
  const color = 0x4da3ff
  if (segs.length) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3))
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, depthTest: false }))
    l.renderOrder = 20
    group.add(l)
  }
  if (dots.length) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3))
    const d = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 9, sizeAttenuation: false, transparent: true, opacity: 0.8, depthTest: false }))
    d.renderOrder = 20
    group.add(d)
  }
  group.traverse((o) => (o.raycast = () => {}))
  return group
}

/**
 * A set piece as a binary glTF (.glb), for MVR files: other programs (Capture,
 * Vectorworks, grandMA3) show the totem or stage too. Our room materials are
 * shaders, so the copy uses plain materials of the same colour.
 */
export async function structureGlb(s: Structure): Promise<Uint8Array | null> {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
  const model = buildStructure(s)
  const plain = new Map<THREE.Material, THREE.Material>()
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const mat = o.material as THREE.Material
    if (!plain.has(mat)) {
      const base = (mat as THREE.ShaderMaterial).uniforms?.base?.value as THREE.Color | undefined
      plain.set(mat, base ? new THREE.MeshStandardMaterial({ color: base, roughness: 0.8, side: (mat as THREE.ShaderMaterial).side }) : mat)
    }
    o.material = plain.get(mat)!
  })
  model.children.filter((c) => c instanceof THREE.LineSegments).forEach((c) => model.remove(c))
  try {
    const result = await new GLTFExporter().parseAsync(model, { binary: true })
    return result instanceof ArrayBuffer ? new Uint8Array(result) : null
  } catch {
    return null
  } finally {
    disposeGroup(model)
    for (const [orig, copy] of plain) if (copy !== orig) copy.dispose()
  }
}
