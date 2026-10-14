/**
 * Test signals for the faders, so you can see the rig move without a console.
 */
import { dmxBus } from './dmxBus'
import { getFixtureType, type ChannelFunction } from '../model/fixtureTypes'
import { headsOf, type ChannelRef } from '../model/heads'
import type { Project, Fixture } from '../model/project'

function channelOf(fixture: Fixture, fn: ChannelFunction): number | null {
  const index = getFixtureType(fixture.typeId).channels.indexOf(fn)
  return index < 0 ? null : fixture.address + index
}

/** Sets every channel with this function (pixel bars have one Red per cell, for example). */
function set(fixture: Fixture, fn: ChannelFunction, level: number | ((cell: number) => number)): void {
  const channels = getFixtureType(fixture.typeId).channels
  let cell = 0
  channels.forEach((f, i) => {
    if (f !== fn) return
    dmxBus.setFader(fixture.universe, fixture.address + i, typeof level === 'function' ? level(cell) : level, false)
    cell++
  })
}

/** Point every moving head straight down (pan and tilt at 50%) without touching other channels. */
export function homeFixtures(project: Project): void {
  for (const f of project.fixtures) {
    if (dmxBus.getFader(f.universe, channelOf(f, 'pan') ?? 0) === 0) set(f, 'pan', 128)
    if (dmxBus.getFader(f.universe, channelOf(f, 'tilt') ?? 0) === 0) set(f, 'tilt', 128)
  }
}

/**
 * A simple looping "show": sweeping heads, colour chases across pixel cells.
 * Works head by head, so it opens each fixture's shutter with a value that
 * really means "open" for that model.
 */
export function runDemo(project: Project, time: number): void {
  project.fixtures.forEach((f, i) => {
    const heads = headsOf(getFixtureType(f.typeId))
    const put = (ref: ChannelRef | undefined, level: number) => {
      if (!ref) return
      const v = Math.max(0, Math.min(1, level))
      if (ref.fine !== undefined) {
        const full = Math.round(v * 65535)
        dmxBus.setFader(f.universe, f.address + ref.coarse, full >> 8, false)
        dmxBus.setFader(f.universe, f.address + ref.fine, full & 255, false)
      } else {
        dmxBus.setFader(f.universe, f.address + ref.coarse, v * 255, false)
      }
    }
    heads.forEach((h, k) => {
      const [r, g, b] = hsvToRgb((time * 0.08 + i * 0.12 + k * 0.05) % 1, 1, 1)
      put(h.ch.dimmer, 1)
      const open = h.shutter?.find((x) => x.kind === 'open')
      put(h.ch.shutter, open ? (open.lo + open.hi) / 2 / 255 : 0)
      put(h.ch.red, r)
      put(h.ch.green, g)
      put(h.ch.blue, b)
      put(h.ch.white, 0)
      put(h.ch.amber, 0)
      put(h.ch.uv, 0)
      if (h.colorWheel?.length) {
        const slot = h.colorWheel[Math.floor(time / 3 + i) % h.colorWheel.length]
        put(h.ch.colorWheel, (slot.lo + slot.hi) / 2 / 255)
      }
      // Real sweeps: the head swings out (tilt) and around (pan), so beams travel across the room.
      put(h.ch.pan, 0.5 + Math.sin(time * 0.35 + i * 0.6) * 0.12)
      put(h.ch.tilt, 0.5 + 0.1 + Math.sin(time * 0.5 + i * 0.6) * 0.12)
      put(h.ch.zoom, 0.3 + Math.sin(time * 0.3 + i) * 0.2)
      put(h.ch.rotation, 0.3)
      put(h.ch.gobo, Math.floor(time / 6) % 2 ? 0.3 : 0)
    })
  })
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  return ([[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]] as const)[i % 6] as [number, number, number]
}
