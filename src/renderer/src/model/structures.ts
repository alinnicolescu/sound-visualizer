/**
 * Set pieces: totems, stands, truss, stage decks, tables, DJ booths, pipe and
 * drape, speakers. Plain data, like fixtures; three/structures.ts draws them.
 *
 * Each kind knows its real-world size, the surfaces other things can stand on
 * (a stage deck's top, a table top), and its mount points: where a fixture can
 * sit on top, hang underneath or clamp to the side. physics.ts uses those to
 * keep everything resting on something (nothing in the floor, nothing floating).
 *
 * Sizes are stored in metres. Presets use the feet and inches the gear is sold in.
 * Sources: Chauvet DJ FLEXstand (1.5-2.4 m, 21.6 in base, M10 top); industry
 * standard F34 box truss (290 mm), 4 × 4 / 4 × 8 ft stage decks, 6/8 ft banquet
 * tables (30 in deep, 29 in high), Pro X XF-4X3048 facade panels (30 × 48 in).
 */
import type { Vec3 } from './project'

export const FT = 0.3048
export const IN = 0.0254

export type StructureKind =
  | 'totem' | 'flexstand' | 'tbar' | 'tubeStand'
  | 'goalpost' | 'trussBox' | 'groundTruss'
  | 'stage' | 'table' | 'djBooth' | 'pipeDrape'
  | 'speakerColumn' | 'speakerOnPole' | 'sub'

export type Cover = 'none' | 'white' | 'black'

export interface Structure {
  id: string
  kind: StructureKind
  name: string
  /** x and z are where it stands; y is worked out (the floor, or the top of what it stands on). */
  position: Vec3
  /** Turn around its vertical axis, degrees. */
  rotation: number
  /** Size and options; which ones depend on the kind (see STRUCTURE_KINDS). */
  params: StructureParams
}

export interface StructureParams {
  width?: number
  depth?: number
  height?: number
  /** Truss profile size (square, metres). */
  truss?: number
  /** Scrim, skirt or drape colour. */
  cover?: Cover
  /** Number of pipe & drape spans. */
  spans?: number
  /** Stage: steps at the front. */
  stairs?: boolean
}

/** Where a fixture attaches. */
export type MountKind = 'top' | 'under' | 'clamp' | 'face'

export interface MountPoint {
  id: string
  kind: MountKind
  /** Local position (structure at the origin, unrotated), metres. */
  at: Vec3
  /** For a bar or a leg: the other end. A fixture can clamp anywhere between `at` and `to`. */
  to?: Vec3
  /** Which way a clamped fixture faces, degrees around Y (0 = towards the audience, +z). */
  facing?: number
  label: string
}

export interface ParamField {
  key: keyof StructureParams
  label: string
  kind: 'length' | 'cover' | 'count' | 'boolean' | 'truss'
  min?: number
  max?: number
  /** Quick picks, in feet for lengths. */
  presets?: number[]
}

export interface KindInfo {
  label: string
  category: 'Totems & stands' | 'Truss' | 'Staging' | 'DJ & furniture' | 'Drape' | 'Audio'
  description: string
  defaults: StructureParams
  fields: ParamField[]
  /** Things can stand on its top. */
  surface: boolean
}

const TRUSS_SIZES: Array<[string, number]> = [['F34 square (12 in)', 0.29], ['F24 square (8 in)', 0.22], ['F14 mini (6 in)', 0.15]]
export const TRUSS_OPTIONS = TRUSS_SIZES

export const STRUCTURE_KINDS: Record<StructureKind, KindInfo> = {
  totem: {
    label: 'Totem', category: 'Totems & stands', surface: false,
    description: 'Square truss totem with a 24 in base plate and a 12 in top plate. Fixtures sit on top or clamp to the front.',
    defaults: { height: 6 * FT, truss: 0.29, cover: 'white' },
    fields: [
      { key: 'height', label: 'Height', kind: 'length', min: 0.5, max: 4, presets: [2, 4, 6, 8, 9] },
      { key: 'truss', label: 'Truss', kind: 'truss' },
      { key: 'cover', label: 'Scrim', kind: 'cover' }
    ]
  },
  flexstand: {
    label: 'Chauvet DJ FLEXstand', category: 'Totems & stands', surface: false,
    description: 'Telescoping stand, 1.5-2.4 m (4.8-8 ft), 21.6 in square base, M10 mount on top. Optional scrim.',
    defaults: { height: 2.0, cover: 'none' },
    fields: [
      { key: 'height', label: 'Height', kind: 'length', min: 1.5, max: 2.44, presets: [5, 6, 7, 8] },
      { key: 'cover', label: 'Scrim', kind: 'cover' }
    ]
  },
  tubeStand: {
    label: 'Tube stand', category: 'Totems & stands', surface: false,
    description: 'A mic-stand style pole on a round weighted base for a pixel tube (like the Both Lighting 360 Tube). The tube stands upright on top.',
    defaults: { height: 4 * FT },
    fields: [{ key: 'height', label: 'Height', kind: 'length', min: 0.15, max: 3, presets: [1, 2, 4, 6, 8] }]
  },
  tbar: {
    label: 'T-bar lighting stand', category: 'Totems & stands', surface: false,
    description: 'Tripod stand with a T-bar on top: four fixtures on or under the bar.',
    defaults: { height: 2.6, width: 1.2 },
    fields: [
      { key: 'height', label: 'Height', kind: 'length', min: 1.2, max: 4, presets: [6, 8, 10, 12] },
      { key: 'width', label: 'Bar width', kind: 'length', min: 0.6, max: 2, presets: [3, 4, 5] }
    ]
  },
  goalpost: {
    label: 'Goalpost truss', category: 'Truss', surface: false,
    description: 'Two truss uprights and a crossbar. Hang fixtures under the bar, sit them on top, or clamp to the legs.',
    defaults: { width: 10 * FT, height: 10 * FT, truss: 0.29 },
    fields: [
      { key: 'width', label: 'Span', kind: 'length', min: 1, max: 24, presets: [10, 15, 20, 30, 40] },
      { key: 'height', label: 'Height', kind: 'length', min: 1.5, max: 10, presets: [8, 10, 12, 16, 20] },
      { key: 'truss', label: 'Truss', kind: 'truss' }
    ]
  },
  trussBox: {
    label: 'Truss box (cube)', category: 'Truss', surface: false,
    description: 'Four uprights with a square or rectangular truss frame on top, like a DJ cage or a ground-supported rig.',
    defaults: { width: 10 * FT, depth: 10 * FT, height: 10 * FT, truss: 0.29 },
    fields: [
      { key: 'width', label: 'Width', kind: 'length', min: 1, max: 24, presets: [8, 10, 15, 20] },
      { key: 'depth', label: 'Depth', kind: 'length', min: 1, max: 24, presets: [8, 10, 15, 20] },
      { key: 'height', label: 'Height', kind: 'length', min: 1.5, max: 10, presets: [8, 10, 12, 16] },
      { key: 'truss', label: 'Truss', kind: 'truss' }
    ]
  },
  groundTruss: {
    label: 'Truss on the floor', category: 'Truss', surface: false,
    description: 'A straight truss section lying on the floor (a ground row). Fixtures sit on top.',
    defaults: { width: 10 * FT, truss: 0.29 },
    fields: [
      { key: 'width', label: 'Length', kind: 'length', min: 0.5, max: 20, presets: [5, 8, 10, 15, 20] },
      { key: 'truss', label: 'Truss', kind: 'truss' }
    ]
  },
  stage: {
    label: 'Stage deck', category: 'Staging', surface: true,
    description: 'Made of 4 × 4 ft or 4 × 8 ft decks on legs. Anything placed on it stands on top. Skirt (scrim) and front steps optional.',
    defaults: { width: 8 * FT, depth: 12 * FT, height: 2 * FT, cover: 'black', stairs: true },
    fields: [
      { key: 'width', label: 'Width', kind: 'length', min: 1.2, max: 30, presets: [4, 8, 12, 16, 24] },
      { key: 'depth', label: 'Depth', kind: 'length', min: 1.2, max: 20, presets: [4, 8, 12, 16] },
      { key: 'height', label: 'Height', kind: 'length', min: 0.05, max: 2.5, presets: [1, 2, 4, 6] },
      { key: 'cover', label: 'Skirt', kind: 'cover' },
      { key: 'stairs', label: 'Front steps', kind: 'boolean' }
    ]
  },
  table: {
    label: 'Table', category: 'DJ & furniture', surface: true,
    description: 'Banquet table, 30 in deep and 29 in high. Use for a second DJ setup or merch; add a skirt.',
    defaults: { width: 6 * FT, depth: 30 * IN, height: 29 * IN, cover: 'black' },
    fields: [
      { key: 'width', label: 'Length', kind: 'length', min: 0.6, max: 4, presets: [4, 6, 8] },
      { key: 'depth', label: 'Depth', kind: 'length', min: 0.4, max: 1.5 },
      { key: 'height', label: 'Height', kind: 'length', min: 0.4, max: 1.3, presets: [2.5, 3, 3.5] },
      { key: 'cover', label: 'Skirt', kind: 'cover' }
    ]
  },
  djBooth: {
    label: 'DJ booth (facade)', category: 'DJ & furniture', surface: true,
    description: 'Table with a scrim facade in front (30 × 48 in panels). Bars stand on top; LED tape can run along the front.',
    defaults: { width: 10 * FT, depth: 30 * IN, height: 48 * IN, cover: 'white' },
    fields: [
      { key: 'width', label: 'Width', kind: 'length', min: 1, max: 6, presets: [5, 7.5, 10] },
      { key: 'height', label: 'Height', kind: 'length', min: 0.8, max: 1.4, presets: [3.5, 4] },
      { key: 'cover', label: 'Facade', kind: 'cover' }
    ]
  },
  pipeDrape: {
    label: 'Pipe & drape', category: 'Drape', surface: false,
    description: 'Uprights on base plates with crossbars and drape. Light fixtures can hang from the crossbar.',
    defaults: { width: 10 * FT, height: 10 * FT, spans: 2, cover: 'black' },
    fields: [
      { key: 'spans', label: 'Spans', kind: 'count', min: 1, max: 12 },
      { key: 'width', label: 'Span width', kind: 'length', min: 1.5, max: 5, presets: [8, 10, 12, 16] },
      { key: 'height', label: 'Height', kind: 'length', min: 1.5, max: 6, presets: [8, 10, 12, 16] },
      { key: 'cover', label: 'Drape', kind: 'cover' }
    ]
  },
  speakerColumn: {
    label: 'Column PA speaker', category: 'Audio', surface: false,
    description: 'A column PA (like the LD Systems MAUI 44): sub base, spacer and column array, about 2 m tall.',
    defaults: { height: 2.0 },
    fields: [{ key: 'height', label: 'Height', kind: 'length', min: 1.5, max: 2.5 }]
  },
  speakerOnPole: {
    label: 'Speaker on a pole', category: 'Audio', surface: false,
    description: 'A 12-15 in top speaker on a pole or tripod.',
    defaults: { height: 1.9 },
    fields: [{ key: 'height', label: 'Speaker height', kind: 'length', min: 1.2, max: 2.6, presets: [5, 6, 7] }]
  },
  sub: {
    label: 'Subwoofer', category: 'Audio', surface: true,
    description: '18 in subwoofer. Things can stand on it.',
    defaults: { width: 0.6, depth: 0.75, height: 0.65 },
    fields: [
      { key: 'width', label: 'Width', kind: 'length', min: 0.4, max: 1 },
      { key: 'height', label: 'Height', kind: 'length', min: 0.4, max: 1 }
    ]
  }
}

export function paramsOf(s: Structure): Required<Pick<StructureParams, 'width' | 'depth' | 'height' | 'truss'>> & StructureParams {
  const d = STRUCTURE_KINDS[s.kind].defaults
  const p = { ...d, ...s.params }
  return { ...p, width: p.width ?? 1, depth: p.depth ?? 1, height: p.height ?? 1, truss: p.truss ?? 0.29 }
}

/** Width × depth of the base (local, before rotation), metres. */
export function footprint(s: Structure): [number, number] {
  const p = paramsOf(s)
  switch (s.kind) {
    case 'totem': return [0.6, 0.6]
    case 'flexstand': return [0.55, 0.55]
    case 'tubeStand': return [0.3, 0.3]
    case 'tbar': return [1.1, 1.1]
    case 'goalpost': return [p.width + 0.6, 0.6]
    case 'trussBox': return [p.width + 0.6, p.depth + 0.6]
    case 'groundTruss': return [p.width, p.truss]
    case 'stage': case 'table': case 'sub': return [p.width, p.depth]
    case 'djBooth': return [p.width, p.depth]
    case 'pipeDrape': return [(p.spans ?? 1) * p.width, 0.5]
    case 'speakerColumn': return [0.4, 0.5]
    case 'speakerOnPole': return [0.9, 0.9]
  }
}

/** Overall height above its base. */
export function heightOf(s: Structure): number {
  const p = paramsOf(s)
  if (s.kind === 'groundTruss') return p.truss
  if (s.kind === 'flexstand' || s.kind === 'totem') return p.height + 0.012
  if (s.kind === 'tubeStand') return p.height + 0.01
  if (s.kind === 'speakerOnPole') return p.height + 0.35
  return p.height
}

/** The height things standing on it are at (local, above its base). Only for surface kinds. */
export function surfaceHeight(s: Structure): number | null {
  if (!STRUCTURE_KINDS[s.kind].surface) return null
  const p = paramsOf(s)
  if (s.kind === 'djBooth') return p.height + 0.02
  return p.height
}

/** A bar along x, centred: fixtures clamp anywhere on it. */
function bar(id: string, kind: MountKind, label: string, length: number, y: number, z: number, facing?: number): MountPoint {
  return { id, kind, at: [round(-length / 2), round(y), round(z)], to: [round(length / 2), round(y), round(z)], facing, label }
}

/** A vertical leg or column: clamp anywhere between two heights. */
function leg(id: string, label: string, x: number, z: number, from: number, to: number): MountPoint {
  return { id, kind: 'clamp', at: [round(x), round(from), round(z)], to: [round(x), round(to), round(z)], facing: 0, label }
}

/** Every place a fixture can attach. */
export function mountPoints(s: Structure): MountPoint[] {
  const p = paramsOf(s)
  const t = p.truss
  switch (s.kind) {
    case 'totem':
      return [{ id: 'top', kind: 'top', at: [0, round(p.height + 0.012), 0], label: 'Top plate' }, leg('front', 'Front face', 0, t / 2 + 0.05, 0.35, Math.max(0.4, p.height - 0.15))]
    case 'flexstand':
      return [{ id: 'top', kind: 'top', at: [0, round(p.height + 0.012), 0], label: 'Top (M10)' }]
    case 'tubeStand':
      return [{ id: 'top', kind: 'top', at: [0, round(p.height + 0.01), 0], label: 'Tube holder' }]
    case 'tbar':
      return [bar('top', 'top', 'On the T-bar', p.width - 0.1, p.height + 0.03, 0), bar('under', 'under', 'Under the T-bar', p.width - 0.1, p.height - 0.03, 0)]
    case 'goalpost':
      return [
        bar('under', 'under', 'Under the crossbar', p.width - t, p.height - t, 0),
        bar('top', 'top', 'On the crossbar', p.width - t, p.height, 0),
        leg('legL', 'Left leg', -p.width / 2, t / 2 + 0.05, 0.5, p.height - t - 0.2),
        leg('legR', 'Right leg', p.width / 2, t / 2 + 0.05, 0.5, p.height - t - 0.2)
      ]
    case 'trussBox':
      return [
        bar('front', 'under', 'Under the front bar', p.width - t, p.height - t, p.depth / 2),
        bar('back', 'under', 'Under the back bar', p.width - t, p.height - t, -p.depth / 2),
        bar('ftop', 'top', 'On the front bar', p.width - t, p.height, p.depth / 2),
        bar('btop', 'top', 'On the back bar', p.width - t, p.height, -p.depth / 2)
      ]
    case 'groundTruss':
      return [bar('top', 'top', 'On the truss', p.width - 0.1, t, 0)]
    case 'djBooth':
      return [bar('ftop', 'face', 'Facade, top edge', p.width - 0.2, p.height - 0.06, p.depth / 2 + 0.02, 0), bar('fbot', 'face', 'Facade, bottom edge', p.width - 0.2, 0.08, p.depth / 2 + 0.02, 0)]
    case 'pipeDrape':
      return [bar('under', 'under', 'Under the crossbar', (p.spans ?? 1) * p.width - 0.1, p.height - 0.05, 0)]
    default:
      return []
  }
}

/** The local point at `t` (0..1) along a mount point (or the point itself). */
export function pointAt(m: MountPoint, t = 0.5): Vec3 {
  if (!m.to) return m.at
  const k = Math.max(0, Math.min(1, t))
  return [m.at[0] + (m.to[0] - m.at[0]) * k, m.at[1] + (m.to[1] - m.at[1]) * k, m.at[2] + (m.to[2] - m.at[2]) * k]
}

/** World point → local (structure at the origin, unrotated). */
export function toLocal(s: Structure, world: Vec3): Vec3 {
  const a = (s.rotation * Math.PI) / 180
  const dx = world[0] - s.position[0]
  const dz = world[2] - s.position[2]
  return [dx * Math.cos(a) - dz * Math.sin(a), world[1] - s.position[1], dx * Math.sin(a) + dz * Math.cos(a)]
}

/** Where along a mount point (0..1) is closest to a local point, and how far it is. */
export function nearestOn(m: MountPoint, local: Vec3): { t: number; distance: number } {
  if (!m.to) return { t: 0, distance: Math.hypot(local[0] - m.at[0], local[1] - m.at[1], local[2] - m.at[2]) }
  const d: Vec3 = [m.to[0] - m.at[0], m.to[1] - m.at[1], m.to[2] - m.at[2]]
  const len2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 || 1
  const t = Math.max(0, Math.min(1, ((local[0] - m.at[0]) * d[0] + (local[1] - m.at[1]) * d[1] + (local[2] - m.at[2]) * d[2]) / len2))
  const q = pointAt(m, t)
  return { t, distance: Math.hypot(local[0] - q[0], local[1] - q[1], local[2] - q[2]) }
}

/** World position of a local point on a structure. */
export function toWorld(s: Structure, local: Vec3): Vec3 {
  const a = (s.rotation * Math.PI) / 180
  const c = Math.cos(a)
  const sn = Math.sin(a)
  return [round(s.position[0] + local[0] * c + local[2] * sn), round(s.position[1] + local[1]), round(s.position[2] - local[0] * sn + local[2] * c)]
}

/** True if the world point (x, z) is over the structure's base. */
export function covers(s: Structure, x: number, z: number, margin = 0): boolean {
  const [w, d] = footprint(s)
  const a = (-s.rotation * Math.PI) / 180
  const dx = x - s.position[0]
  const dz = z - s.position[2]
  const lx = dx * Math.cos(a) + dz * Math.sin(a)
  const lz = -dx * Math.sin(a) + dz * Math.cos(a)
  return Math.abs(lx) <= w / 2 + margin && Math.abs(lz) <= d / 2 + margin
}

/** A friendly default name: "Totem 6 ft", "Stage deck 8 × 12 ft". */
export function defaultName(kind: StructureKind, params: StructureParams): string {
  const info = STRUCTURE_KINDS[kind]
  const p = { ...info.defaults, ...params }
  const ft = (m?: number) => (m === undefined ? '' : `${Math.round((m / FT) * 10) / 10}`)
  switch (kind) {
    case 'totem': return `Totem ${ft(p.height)} ft`
    case 'flexstand': return `FLEXstand ${ft(p.height)} ft`
    case 'tubeStand': return `Tube stand ${ft(p.height)} ft`
    case 'stage': return `Stage ${ft(p.width)} × ${ft(p.depth)} ft, ${ft(p.height)} ft high`
    case 'table': return `Table ${ft(p.width)} ft`
    case 'goalpost': return `Goalpost truss ${ft(p.width)} ft`
    case 'trussBox': return `Truss box ${ft(p.width)} × ${ft(p.depth)} ft`
    case 'groundTruss': return `Truss ${ft(p.width)} ft`
    case 'pipeDrape': return `Pipe & drape ${p.spans} × ${ft(p.width)} ft`
    default: return info.label
  }
}

/** Ready-made set pieces for the library. */
export const STRUCTURE_PRESETS: Array<{ name: string; kind: StructureKind; params: StructureParams }> = [
  ...[2, 4, 6, 8, 9].map((h) => ({ name: `Totem ${h} ft`, kind: 'totem' as const, params: { height: h * FT } })),
  { name: 'FLEXstand (5-8 ft)', kind: 'flexstand', params: { height: 2.0 } },
  ...[2, 4, 6, 8].map((h) => ({ name: `Tube stand ${h} ft`, kind: 'tubeStand' as const, params: { height: h * FT } })),
  { name: 'T-bar stand', kind: 'tbar', params: {} },
  { name: 'Goalpost truss 10 × 10 ft', kind: 'goalpost', params: { width: 10 * FT, height: 10 * FT } },
  { name: 'Goalpost truss 20 × 12 ft', kind: 'goalpost', params: { width: 20 * FT, height: 12 * FT } },
  { name: 'Truss box 10 × 10 × 10 ft', kind: 'trussBox', params: {} },
  { name: 'Truss on the floor 10 ft', kind: 'groundTruss', params: {} },
  { name: 'Stage deck 4 × 4 ft', kind: 'stage', params: { width: 4 * FT, depth: 4 * FT, height: 2 * FT, stairs: false } },
  { name: 'Stage deck 4 × 8 ft', kind: 'stage', params: { width: 8 * FT, depth: 4 * FT, height: 2 * FT, stairs: false } },
  { name: 'Stage 8 × 12 ft', kind: 'stage', params: { width: 12 * FT, depth: 8 * FT, height: 2 * FT } },
  { name: 'Stage 16 × 12 ft, 4 ft high', kind: 'stage', params: { width: 16 * FT, depth: 12 * FT, height: 4 * FT } },
  { name: 'Table 6 ft', kind: 'table', params: { width: 6 * FT } },
  { name: 'Table 8 ft', kind: 'table', params: { width: 8 * FT } },
  { name: 'DJ booth with facade', kind: 'djBooth', params: {} },
  { name: 'Pipe & drape, 2 × 10 ft', kind: 'pipeDrape', params: {} },
  { name: 'Column PA speaker', kind: 'speakerColumn', params: {} },
  { name: 'Speaker on a pole', kind: 'speakerOnPole', params: {} },
  { name: 'Subwoofer 18 in', kind: 'sub', params: {} }
]

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}
