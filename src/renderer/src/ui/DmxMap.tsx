/**
 * The DMX map, laid out like SoundSwitch's: one tab per universe (Universe One,
 * Two...), the 512 channels in rows of 32, and each fixture as a coloured band
 * across the channels it uses, named at its start address. Channels two
 * fixtures share (a cross-patch) are marked in yellow, as SoundSwitch does.
 *
 * Live DMX shows as a level bar along the bottom of each channel. Click a
 * fixture to select it (Shift adds), double-click to frame it in the 3D view,
 * and hover to see what each channel does.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useMix } from '../state/mix'
import { dmxBus } from '../state/dmxBus'
import { footprint, type Fixture } from '../model/project'
import { getFixtureType, plainName } from '../model/fixtureTypes'
import { view } from '../state/viewBus'

const COLS = 32
const ROWS = 16
const NUMBER_WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']

/** "Universe One", like SoundSwitch; past eight, plain numbers. */
export function universeName(u: number): string {
  return `Universe ${NUMBER_WORDS[u] ?? u + 1}`
}

const FUNCTION_LABEL: Record<string, string> = {
  pan: 'Pan', panFine: 'Pan fine', tilt: 'Tilt', tiltFine: 'Tilt fine', dimmer: 'Dimmer', shutter: 'Strobe / shutter',
  red: 'Red', green: 'Green', blue: 'Blue', white: 'White', amber: 'Amber', uv: 'UV', zoom: 'Zoom',
  colorWheel: 'Colour wheel', gobo: 'Gobo', prism: 'Prism', speed: 'Speed', reserved: '—'
}

/** A distinct colour per group (or, for fixtures in no group, per fixture type). */
const PALETTE = ['#3d7bd9', '#d9733d', '#3dbf86', '#c94fb7', '#d9c23d', '#5fc6d9', '#8f6bd9', '#d94f5f', '#7fbf3d', '#d98fb9']

interface Owner {
  fixture: Fixture
  first: boolean
  last: boolean
  index: number
}

export function DmxMap() {
  const fixtures = useStore((s) => s.project.fixtures)
  const groupNames = useStore((s) => s.project.groupNames)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const mix = useMix()
  const universes = useMemo(() => [...new Set([0, ...fixtures.map((f) => f.universe)])].sort((a, b) => a - b), [fixtures])
  const [universe, setUniverse] = useState(() => universes[0] ?? 0)
  const [hover, setHover] = useState<{ channel: number; owners: Owner[] } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  // Colours: by group when a fixture has one, otherwise by its type.
  const colorOf = useMemo(() => {
    const types = [...new Set(fixtures.filter((f) => !f.group).map((f) => f.typeId))]
    return (f: Fixture) => (f.group ? PALETTE[(f.group - 1) % PALETTE.length] : PALETTE[(4 + types.indexOf(f.typeId)) % PALETTE.length])
  }, [fixtures])

  // Which fixtures use each channel of this universe (more than one = cross-patch).
  const owners = useMemo(() => {
    const map: Owner[][] = Array.from({ length: 513 }, () => [])
    for (const f of fixtures) {
      if (f.universe !== universe) continue
      const n = footprint(f)
      for (let i = 0; i < n && f.address + i <= 512; i++) map[f.address + i].push({ fixture: f, first: i === 0, last: i === n - 1, index: i })
    }
    return map
  }, [fixtures, universe])

  const used = owners.filter((o) => o.length).length
  const crossPatched = owners.filter(clashes).length
  const count = fixtures.filter((f) => f.universe === universe).length

  useEffect(() => {
    const el = canvas.current!
    const ctx = el.getContext('2d')!
    let frame = 0
    const draw = () => {
      frame = requestAnimationFrame(draw)
      const ratio = window.devicePixelRatio || 1
      const w = el.clientWidth
      const h = el.clientHeight
      if (el.width !== Math.round(w * ratio) || el.height !== Math.round(h * ratio)) {
        el.width = Math.round(w * ratio)
        el.height = Math.round(h * ratio)
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const cw = w / COLS
      const ch = h / ROWS
      const levels = dmxBus.levels(universe)
      const small = Math.max(8, Math.min(10, ch * 0.32))
      ctx.textBaseline = 'top'

      // Cells
      for (let c = 1; c <= 512; c++) {
        const x = ((c - 1) % COLS) * cw
        const y = Math.floor((c - 1) / COLS) * ch
        const own = owners[c]
        const top = own[0]
        const live = top && mix.isLive(top.fixture.id) && !mix.hidden.includes(top.fixture.id)
        if (!top) {
          ctx.fillStyle = '#121519'
          ctx.fillRect(x + 0.5, y + 0.5, cw - 1, ch - 1)
        } else {
          ctx.fillStyle = colorOf(top.fixture)
          ctx.globalAlpha = live ? 0.42 : 0.16
          // A fixture is one continuous band: no gap between its own channels.
          const left = top.first ? 1.5 : 0
          const right = top.last ? 1.5 : 0
          ctx.fillRect(x + left, y + 1.5, cw - left - right, ch - 3)
          ctx.globalAlpha = 1
        }
        if (clashes(own)) {
          // Cross-patch: yellow, like SoundSwitch. (Copies on one patch mirror on purpose: not marked.)
          ctx.fillStyle = 'rgba(240, 200, 40, 0.55)'
          ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2)
        }
        const level = levels[c - 1]
        if (level > 0) {
          ctx.fillStyle = `rgba(235, 242, 255, ${0.25 + (level / 255) * 0.45})`
          ctx.fillRect(x + 2, y + ch - 4, (cw - 4) * (level / 255), 1.5)
        }
        // Channel numbers only on free channels; a fixture's band carries its name instead.
        if (!top) {
          ctx.font = `${small}px ui-monospace, Menlo, monospace`
          ctx.fillStyle = '#3c434d'
          ctx.fillText(String(c), x + 3, y + Math.max(2, (ch - small) / 2))
        }
      }

      // Outlines around each fixture's band, and names at the start address.
      for (const f of fixtures) {
        if (f.universe !== universe) continue
        const n = footprint(f)
        const selected = selection.includes(f.id)
        ctx.strokeStyle = selected ? '#ffffff' : colorOf(f)
        ctx.lineWidth = selected ? 2 : 1
        for (let i = 0; i < n && f.address + i <= 512; i++) {
          const c = f.address + i
          const x = ((c - 1) % COLS) * cw
          const y = Math.floor((c - 1) / COLS) * ch
          const rowStart = (c - 1) % COLS === 0
          const rowEnd = (c - 1) % COLS === COLS - 1
          ctx.beginPath()
          ctx.moveTo(x, y + 1.5)
          ctx.lineTo(x + cw, y + 1.5)
          ctx.moveTo(x, y + ch - 1.5)
          ctx.lineTo(x + cw, y + ch - 1.5)
          if (i === 0 || rowStart) {
            ctx.moveTo(x + 1.5, y + 1.5)
            ctx.lineTo(x + 1.5, y + ch - 1.5)
          }
          if (i === n - 1 || rowEnd) {
            ctx.moveTo(x + cw - 1.5, y + 1.5)
            ctx.lineTo(x + cw - 1.5, y + ch - 1.5)
          }
          ctx.stroke()
        }
        // Name, clipped to the band's first row.
        const c = f.address
        const x = ((c - 1) % COLS) * cw
        const y = Math.floor((c - 1) / COLS) * ch
        const room = Math.min(n, COLS - ((c - 1) % COLS)) * cw - 8
        ctx.save()
        ctx.beginPath()
        ctx.rect(x + 2, y, room + 4, ch)
        ctx.clip()
        const big = Math.max(9, Math.min(11.5, ch * 0.5))
        ctx.font = `600 ${big}px -apple-system, Inter, sans-serif`
        ctx.fillStyle = '#ffffff'
        const twoLines = ch >= 26
        ctx.fillText(`${f.address}  ${f.name}${twoLines ? '' : `  · ${n} ch`}`, x + 5, twoLines ? y + 3 : y + (ch - big) / 2)
        if (twoLines) {
          ctx.font = `${small}px -apple-system, Inter, sans-serif`
          ctx.fillStyle = 'rgba(255,255,255,0.6)'
          ctx.fillText(`${n} ch${f.group ? ` · G${f.group}` : ''}`, x + 5, y + 3 + big + 1)
        }
        ctx.restore()
      }
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [owners, universe, selection, fixtures, colorOf, mix])

  const channelAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * COLS)
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * ROWS)
    const c = row * COLS + col + 1
    return c >= 1 && c <= 512 ? c : null
  }

  const hovered = hover?.owners[0]
  const info = hover
    ? hovered
      ? `Ch ${hover.channel} · ${hovered.fixture.name} (${hovered.fixture.address}–${hovered.fixture.address + footprint(hovered.fixture) - 1}) · ${
          FUNCTION_LABEL[getFixtureType(hovered.fixture.typeId).channels[hovered.index]] ?? 'Channel'
        } · ${plainName(getFixtureType(hovered.fixture.typeId).name)}${hover.owners.length > 1 ? ` · also ${hover.owners.slice(1).map((o) => o.fixture.name).join(', ')}${clashes(hover.owners) ? ': cross-patched' : ' (copies, mirroring it)'}` : ''}`
      : `Ch ${hover.channel} · free`
    : null

  const groups = [...new Set(fixtures.filter((f) => f.universe === universe && f.group).map((f) => f.group!))].sort((a, b) => a - b)

  return (
    <div className="dmx-map">
      <div className="dmx-bar">
        <div className="dmx-tabs">
          {universes.map((u) => (
            <button key={u} className={`dmx-tab ${u === universe ? 'on' : ''}`} onClick={() => setUniverse(u)} title={`Art-Net universe ${u}`}>
              {universeName(u)}
            </button>
          ))}
        </div>
        <span className="hint dmx-summary">
          {count} fixtures · {used}/512 channels{crossPatched ? <b className="cross"> · {crossPatched} cross-patched</b> : ''}
        </span>
        <div className="dmx-legend">
          {groups.map((g) => (
            <span key={g} className="dmx-key">
              <i style={{ background: PALETTE[(g - 1) % PALETTE.length] }} />
              {groupNames?.[g] ?? `Group ${g}`}
            </span>
          ))}
        </div>
      </div>
      <div className="dmx-info">{info ?? 'Click a fixture to select it, double-click to find it in the 3D view. Bars show live levels.'}</div>
      <canvas
        ref={canvas}
        className="dmx-canvas"
        onMouseMove={(e) => {
          const c = channelAt(e)
          setHover(c ? { channel: c, owners: owners[c] } : null)
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const c = channelAt(e)
          const id = c ? owners[c][0]?.fixture.id : undefined
          if (!id) return e.shiftKey ? undefined : select([])
          select(e.shiftKey ? (selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id]) : [id])
        }}
        onDoubleClick={(e) => {
          const c = channelAt(e)
          const id = c ? owners[c][0]?.fixture.id : undefined
          if (id) view.focus([id])
        }}
      />
    </div>
  )
}

/** Two different things on one channel. Copies (same type, same start address) mirror on purpose. */
function clashes(own: Owner[]): boolean {
  return new Set(own.map((o) => `${o.fixture.address}.${o.fixture.typeId}`)).size > 1
}
