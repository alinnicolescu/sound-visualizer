/**
 * Heads: the separately controlled parts of a fixture.
 *
 * A simple PAR has one head. A pixel tube has 16 (one per cell). A GigBar has
 * movers, derbies, pars, strobes, a laser and a "master" section that dims
 * them all. Each head knows which DMX channels drive which of its functions,
 * plus the fixture's own value ranges (which shutter values mean "open", which
 * colour-wheel slot is red), so decoding matches what the real fixture does.
 */
import type { ChannelFunction, FixtureType } from './fixtureTypes'

export type HeadRole = 'beam' | 'pixel' | 'derby' | 'strobe' | 'laser' | 'halo' | 'master'

export interface ChannelRef {
  /** 0-based channel within the fixture's mode. */
  coarse: number
  /** Low byte for 16-bit values. */
  fine?: number
}

export interface WheelSlot {
  lo: number
  hi: number
  /** 0..1 */
  rgb: [number, number, number]
}

export interface ShutterRange {
  lo: number
  hi: number
  kind: 'open' | 'closed' | 'strobe'
}

export type HeadFunction =
  | 'dimmer' | 'pan' | 'tilt' | 'red' | 'green' | 'blue' | 'white' | 'amber' | 'uv'
  | 'shutter' | 'zoom' | 'colorWheel' | 'gobo' | 'goboRotation' | 'prism' | 'prismRotation' | 'moveSpeed' | 'rotation' | 'laser'

/** A gobo wheel range: which slot it shows (0 = open). */
export interface GoboSlot {
  lo: number
  hi: number
  slot: number
}

/** A gobo rotation range: spin speed going from `from` to `to`, turns per second (minus = anticlockwise). */
export interface SpinRange {
  lo: number
  hi: number
  from: number
  to: number
}

export interface HeadDef {
  name: string
  role: HeadRole
  ch: Partial<Record<HeadFunction, ChannelRef>>
  colorWheel?: WheelSlot[]
  shutter?: ShutterRange[]
  goboSlots?: GoboSlot[]
  goboSpin?: SpinRange[]
  prismSpin?: SpinRange[]
  /** Pan/tilt speed channel: `from`/`to` are fractions of full speed (1 = fastest). */
  moveSpeed?: SpinRange[]
}

export interface HeadState {
  /** 0..1 after dimmer, master and shutter. */
  intensity: number
  /** Linear 0..1. */
  color: [number, number, number]
  /** Degrees from the centre of the range. */
  pan: number
  tilt: number
  beamAngle: number
  /** 0 = open, otherwise the gobo slot number. */
  gobo: number
  /** Gobo rotation, turns per second (minus = anticlockwise). */
  goboSpin: number
  /** Prism rotation, turns per second. 0 = the prism stays still. */
  prismSpin: number
  /** Fraction of the fixture's top pan/tilt speed (the pan/tilt speed channel). */
  moveSpeed: number
  /** Prism in (multiplies the beam). */
  prism: boolean
  /** 0..1, e.g. derby rotation speed or laser pattern. */
  rotation: number
}

const ROLE_FUNCTIONS: ChannelFunction[] = ['red', 'green', 'blue', 'white', 'amber', 'uv']

/** Built-in types only list channels; turn them into heads (one per colour cell). */
export function headsFromChannels(type: FixtureType): HeadDef[] {
  const cells = Math.max(1, type.cells ?? 1)
  const seen = new Map<ChannelFunction, number>()
  const heads: HeadDef[] = Array.from({ length: cells }, (_, i) => ({
    name: cells > 1 ? `Cell ${i + 1}` : 'Main',
    role: cells > 1 ? 'pixel' : 'beam',
    ch: {}
  }))
  const shared: HeadDef['ch'] = {}
  type.channels.forEach((fn, index) => {
    const n = seen.get(fn) ?? 0
    seen.set(fn, n + 1)
    const target = ROLE_FUNCTIONS.includes(fn) ? heads[Math.min(n, cells - 1)].ch : shared
    if (fn === 'panFine') shared.pan = { ...(shared.pan ?? { coarse: index }), fine: index }
    else if (fn === 'tiltFine') shared.tilt = { ...(shared.tilt ?? { coarse: index }), fine: index }
    else if (fn !== 'reserved' && fn !== 'speed' && !(fn in target)) (target as Record<string, ChannelRef>)[fn] = { coarse: index }
  })
  // Movement, dimmer and shutter apply to every cell.
  for (const head of heads) head.ch = { ...shared, ...head.ch }
  return heads
}

/** A flat channel list (for the faders and universe view) from a fixture's heads. */
export function channelListFromHeads(count: number, heads: HeadDef[]): ChannelFunction[] {
  const channels: ChannelFunction[] = new Array(count).fill('reserved')
  const label: Partial<Record<HeadFunction, ChannelFunction>> = {
    dimmer: 'dimmer', pan: 'pan', tilt: 'tilt', red: 'red', green: 'green', blue: 'blue', white: 'white',
    amber: 'amber', uv: 'uv', shutter: 'shutter', zoom: 'zoom', colorWheel: 'colorWheel', gobo: 'gobo', prism: 'prism'
  }
  for (const head of heads) {
    for (const [fn, ref] of Object.entries(head.ch) as Array<[HeadFunction, ChannelRef]>) {
      const name = label[fn]
      if (name && ref.coarse < count && channels[ref.coarse] === 'reserved') channels[ref.coarse] = name
      if (ref.fine !== undefined && ref.fine < count) {
        if (fn === 'pan') channels[ref.fine] = 'panFine'
        if (fn === 'tilt') channels[ref.fine] = 'tiltFine'
      }
    }
  }
  return channels
}

export function headsOf(type: FixtureType): HeadDef[] {
  return type.heads ?? headsFromChannels(type)
}

function read(levels: Uint8Array, address: number, ref?: ChannelRef): number | undefined {
  if (!ref) return undefined
  const coarse = levels[address - 1 + ref.coarse] ?? 0
  if (ref.fine === undefined) return coarse / 255
  return (coarse * 256 + (levels[address - 1 + ref.fine] ?? 0)) / 65535
}

/** How open the shutter is right now, using the fixture's own ranges if it has them. */
function shutterFactor(raw: number | undefined, ranges: ShutterRange[] | undefined, time: number): number {
  if (raw === undefined) return 1
  const value = Math.round(raw * 255)
  let kind: ShutterRange['kind'] = 'open'
  let position = 0
  const range = ranges?.find((r) => value >= r.lo && value <= r.hi)
  if (range) {
    kind = range.kind
    position = (value - range.lo) / Math.max(1, range.hi - range.lo)
  } else if (ranges && ranges.length) {
    // Values between the listed ranges: treat as open, like most fixtures do.
    kind = 'open'
  } else if (value >= 10) {
    // No ranges known: the common convention is 0-9 no strobe, then slow to fast.
    kind = 'strobe'
    position = (value - 10) / 245
  }
  if (kind === 'closed') return 0
  if (kind === 'open') return 1
  const hz = 1 + position * 19
  return (time * hz) % 1 < 0.3 ? 1 : 0
}

function wheelColor(raw: number | undefined, slots: WheelSlot[] | undefined): [number, number, number] | null {
  if (raw === undefined || !slots?.length) return null
  const value = Math.round(raw * 255)
  const slot = slots.find((s) => value >= s.lo && value <= s.hi)
  return slot ? slot.rgb : null
}

/** Gobo rotation speed. Without the fixture's ranges: 0-7 stop, then clockwise slow to fast, then anticlockwise. */
function spinOf(raw: number | undefined, ranges: SpinRange[] | undefined): number {
  if (raw === undefined) return 0
  const v = Math.round(raw * 255)
  if (ranges?.length) {
    const r = ranges.find((x) => v >= x.lo && v <= x.hi)
    if (!r) return 0
    const t = (v - r.lo) / Math.max(1, r.hi - r.lo)
    return r.from + (r.to - r.from) * t
  }
  if (v < 8) return 0
  if (v < 128) return 0.1 + ((v - 8) / 120) * 1.4
  return -(0.1 + ((v - 128) / 127) * 1.4)
}

/** Pan/tilt speed. Without the fixture's ranges, the usual layout: 0 = fastest, 255 = slowest. */
function speedOf(raw: number | undefined, ranges: SpinRange[] | undefined): number {
  if (raw === undefined) return 1
  const v = Math.round(raw * 255)
  if (ranges?.length) {
    const r = ranges.find((x) => v >= x.lo && v <= x.hi)
    if (!r) return 1
    const t = (v - r.lo) / Math.max(1, r.hi - r.lo)
    return Math.max(0.03, r.from + (r.to - r.from) * t)
  }
  return Math.max(0.03, 1 - (v / 255) * 0.97)
}

/** Decode every head of a fixture from its universe's levels. */
export function decodeHeads(type: FixtureType, levels: Uint8Array, address: number, time: number): HeadState[] {
  const heads = headsOf(type)
  const master = heads.find((h) => h.role === 'master')
  const masterDim = master ? (read(levels, address, master.ch.dimmer) ?? 1) * shutterFactor(read(levels, address, master.ch.shutter), master.shutter, time) : 1
  const [narrow, wide] = type.zoomRange

  return heads.map((head) => {
    const r = (fn: HeadFunction) => read(levels, address, head.ch[fn])
    const hasColor = head.ch.red || head.ch.green || head.ch.blue || head.ch.white || head.ch.amber || head.ch.uv
    let color: [number, number, number] = [1, 1, 1]
    if (hasColor) {
      const w = r('white') ?? 0
      const a = r('amber') ?? 0
      const u = r('uv') ?? 0
      color = [
        Math.min(1, (r('red') ?? 0) + w + a + u * 0.3),
        Math.min(1, (r('green') ?? 0) + w + a * 0.55),
        Math.min(1, (r('blue') ?? 0) + w + u * 0.9)
      ]
    }
    const wheel = wheelColor(r('colorWheel'), head.colorWheel)
    // A real colour wheel filters the white lamp. On an RGB fixture the same kind of
    // channel is a colour macro, which replaces the mixed colour while it's active.
    if (wheel) color = hasColor ? [...wheel] : [color[0] * wheel[0], color[1] * wheel[1], color[2] * wheel[2]]

    // No dimmer on this head: colour channels carry the brightness (or it's simply on).
    const dimmer = r('dimmer') ?? (hasColor ? 1 : head.role === 'master' ? 1 : 1)
    const shutter = shutterFactor(r('shutter'), head.shutter, time)
    // A head with nothing that makes light (a fog or fan channel) stays dark.
    const makesLight = hasColor || head.ch.dimmer || head.ch.shutter || head.ch.colorWheel || head.ch.laser || head.role === 'derby' || head.role === 'laser'
    // A colour-wheel-only part (a derby, a laser) is dark when the wheel is in its
    // "blackout" range, i.e. between the slots the fixture lists.
    const wheelOff = !hasColor && !head.ch.dimmer && !!head.ch.colorWheel && !!head.colorWheel?.length && !wheel
    const black = Math.max(color[0], color[1], color[2]) <= 0.001
    const intensity = head.role === 'master' || !makesLight || wheelOff || black ? 0 : dimmer * shutter * masterDim

    const pan = head.ch.pan ? ((r('pan') ?? 0.5) - 0.5) * type.panRange : 0
    const tilt = head.ch.tilt ? ((r('tilt') ?? 0.5) - 0.5) * type.tiltRange : 0
    const zoom = r('zoom')
    const beamAngle = zoom === undefined ? narrow : narrow + zoom * (wide - narrow)
    const goboRaw = r('gobo') ?? 0
    const goboValue = Math.round(goboRaw * 255)
    // With the fixture's own wheel ranges, the exact slot; otherwise a common layout (0-7 open).
    const goboRange = head.goboSlots?.find((g) => goboValue >= g.lo && goboValue <= g.hi)
    const gobo = head.goboSlots?.length ? (goboRange?.slot ?? 0) : goboValue < 8 ? 0 : 1 + Math.floor(goboRaw * 7)
    const goboSpin = spinOf(r('goboRotation'), head.goboSpin)
    const prismSpin = spinOf(r('prismRotation'), head.prismSpin)
    const moveSpeed = speedOf(r('moveSpeed'), head.moveSpeed)
    const prism = (r('prism') ?? 0) * 255 > 20
    const rotation = r('rotation') ?? r('laser') ?? 0
    return { intensity, color, pan, tilt, beamAngle, gobo, goboSpin, prismSpin, moveSpeed, prism, rotation }
  })
}
