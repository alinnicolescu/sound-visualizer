/**
 * The fixture library, laid out like Capture's Library tab: search, browse by
 * manufacturer or kind of fixture, see a fixture's size and modes, then add it
 * (with a quantity and a patch) or drag it into the 3D view.
 */
import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES, searchLibrary, useLibrary } from '../state/library'
import { useStore } from '../state/store'
import { addLibraryFixtures } from '../state/commands'
import type { LibraryEntry } from '../model/oflImport'
import { plainName, type FixtureType } from '../model/fixtureTypes'
import { planPatch } from '../model/project'

export const DRAG_TYPE = 'application/x-ssvis-fixture'

/** What a drag from the library carries. `rig` = a type already in the project. */
export type DragPayload = { library: string; mode: number } | { rig: string }

export function LibraryPanel() {
  const { status, error, entries, recent, load, library } = useLibrary()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const results = useMemo(() => searchLibrary(entries, query, category), [entries, query, category])
  const byMaker = useMemo(() => {
    const groups = new Map<string, LibraryEntry[]>()
    for (const e of results) groups.set(e.manufacturer, [...(groups.get(e.manufacturer) ?? []), e])
    return [...groups]
  }, [results])
  const searching = query.trim().length > 0
  const recentEntries = recent.map((k) => entries.find((e) => e.key === k)).filter((e): e is LibraryEntry => !!e)
  const pickedEntry = entries.find((e) => e.key === picked) ?? null

  const toggle = (maker: string) => {
    const next = new Set(open)
    if (next.has(maker)) next.delete(maker)
    else next.add(maker)
    setOpen(next)
  }

  return (
    <div className="library">
      <div className="list-head">
        <h2>
          Library <span className="count">{entries.length}</span>
        </h2>
        <div className="list-tools">
          <button className="mini" onClick={() => useLibrary.getState().importFiles()} title="Add fixture files downloaded from open-fixture-library.org">
            Import…
          </button>
        </div>
      </div>
      <input data-tour="library-search" className="filter" placeholder="Search maker, model or type…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      <div className="chips">
        {CATEGORIES.map((c) => (
          <button key={c.id} className={`chip ${category === c.id ? 'on' : ''}`} onClick={() => setCategory(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="library-list" data-tour="library-list">
        {status === 'loading' && <p className="hint">Loading the library…</p>}
        {status === 'error' && <p className="problem">{error}</p>}
        {status === 'ready' && (
          <>
            {!searching && category === 'all' && <RigTypes />}
            {!searching && category === 'all' && recentEntries.length > 0 && (
              <Group title="Recent" count={recentEntries.length} open onToggle={() => {}}>
                {recentEntries.map((e) => (
                  <Row key={e.key} entry={e} picked={picked === e.key} onPick={setPicked} />
                ))}
              </Group>
            )}
            {searching
              ? results.slice(0, 300).map((e) => <Row key={e.key} entry={e} picked={picked === e.key} onPick={setPicked} showMaker />)
              : byMaker.map(([maker, list]) => (
                  <Group key={maker} title={maker} count={list.length} open={open.has(maker)} onToggle={() => toggle(maker)}>
                    {list.map((e) => (
                      <Row key={e.key} entry={e} picked={picked === e.key} onPick={setPicked} />
                    ))}
                  </Group>
                ))}
            {results.length === 0 && <p className="hint">Nothing matches. Missing a fixture? Download it from open-fixture-library.org and use Import….</p>}
            {searching && results.length > 300 && <p className="hint">Showing the first 300. Type more to narrow it down.</p>}
          </>
        )}
      </div>

      {pickedEntry && <Details key={pickedEntry.key} entry={pickedEntry} />}
      {library && (
        <p className="credit">
          Fixtures from the{' '}
          <a href="https://open-fixture-library.org" target="_blank" rel="noreferrer">
            Open Fixture Library
          </a>{' '}
          (MIT){library.built ? `, ${library.built}` : ''}.
        </p>
      )}
    </div>
  )
}

function Group({ title, count, open, onToggle, children }: { title: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="lib-group">
      <button className="lib-group-head" onClick={onToggle}>
        <span className="caret">{open ? '▾' : '▸'}</span> {title} <span className="count">{count}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

function kindOf(categories: string[]): string {
  return categories.slice(0, 2).join(' · ') || 'Fixture'
}

function Row({ entry, picked, onPick, showMaker }: { entry: LibraryEntry; picked: boolean; onPick: (k: string) => void; showMaker?: boolean }) {
  return (
    <div
      className={`lib-row ${picked ? 'picked' : ''}`}
      onClick={() => onPick(entry.key)}
      draggable
      onDragStart={(e) => {
        const payload: DragPayload = { library: entry.key, mode: 0 }
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      title="Click for details, or drag into the 3D view"
    >
      <div className="lib-name">{showMaker ? `${entry.manufacturer} ${entry.name}` : entry.name}</div>
      <div className="sub">
        {kindOf(entry.categories)} · {entry.modes.length} mode{entry.modes.length === 1 ? '' : 's'}
      </div>
    </div>
  )
}

/** Types already in the project (your SoundSwitch fixtures): add more of the same. */
function RigTypes() {
  const project = useStore((s) => s.project)
  const [isOpen, setOpen] = useState(false)
  const types = (project.fixtureTypes ?? []).filter((t) => project.fixtures.some((f) => f.typeId === t.id))
  if (!types.length) return null
  return (
    <Group title="In your rig" count={types.length} open={isOpen} onToggle={() => setOpen(!isOpen)}>
      {types.map((t) => (
        <div
          key={t.id}
          className="lib-row"
          draggable
          onDragStart={(e) => {
            const payload: DragPayload = { rig: t.id }
            e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
          }}
          title="Drag into the 3D view to add another one with its own patch"
        >
          <div className="lib-name">{plainName(t.name)}</div>
          <div className="sub">
            {t.source ?? 'Fixture'} · {t.channels.length} ch
          </div>
          <AddOne type={t} />
        </div>
      ))}
    </Group>
  )
}

function AddOne({ type }: { type: FixtureType }) {
  return (
    <button
      className="mini add-one"
      title="Add another with its own patch"
      onClick={(e) => {
        e.stopPropagation()
        addLibraryFixtures(type, 1)
      }}
    >
      +
    </button>
  )
}

function mm(v: number): string {
  return String(Math.round(v * 1000))
}

function Details({ entry }: { entry: LibraryEntry }) {
  const fixtures = useStore((s) => s.project.fixtures)
  const [mode, setMode] = useState(0)
  const [count, setCount] = useState(1)
  const [start, setStart] = useState('')
  const channels = entry.modes[mode]?.channels ?? 1

  // Where they'd be patched, so you can see it before adding.
  const parsed = /^(\d+)\.(\d+)$/.exec(start.trim()) ?? /^()(\d+)$/.exec(start.trim())
  const startAt = parsed ? { universe: parsed[1] ? Math.max(0, Number(parsed[1]) - 1) : 0, address: Number(parsed[2]) } : undefined
  const plan = planPatch(fixtures, count, channels, startAt)
  const first = plan[0]
  const last = plan.at(-1)

  const add = () => {
    const type = useLibrary.getState().typeFor(entry.key, mode)
    if (type) addLibraryFixtures(type, count, { start: startAt })
  }

  return (
    <div className="lib-details">
      <div
        className="lib-title"
        draggable
        onDragStart={(e) => {
          const payload: DragPayload = { library: entry.key, mode }
          e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
        }}
        title="Drag into the 3D view to place one in this mode"
      >
        <span className="grip">⠿</span> {entry.name}
      </div>
      <div className="sub">
        {entry.manufacturer} · {kindOf(entry.categories)}
      </div>
      <div className="lib-facts">
        {entry.size && (
          <span>
            {mm(entry.size[0])} × {mm(entry.size[1])} × {mm(entry.size[2])} mm
          </span>
        )}
        {entry.weight ? <span>{entry.weight} kg</span> : null}
        {entry.power ? <span>{entry.power} W</span> : null}
      </div>
      <label className="field">
        <span className="label">Mode</span>
        <select value={mode} onChange={(e) => setMode(Number(e.target.value))}>
          {entry.modes.map((m, i) => (
            <option key={i} value={i}>
              {m.name} ({m.channels} ch)
            </option>
          ))}
        </select>
      </label>
      <div className="lib-add">
        <label className="field">
          <span className="label">How many</span>
          <input type="number" min={1} max={64} value={count} onChange={(e) => setCount(Math.max(1, Math.min(64, Number(e.target.value) || 1)))} />
        </label>
        <label className="field">
          <span className="label">Patch from</span>
          <input placeholder="next free" value={start} onChange={(e) => setStart(e.target.value)} title='Universe.address, e.g. "1.101", or just an address' />
        </label>
      </div>
      <p className="hint">
        {first && last
          ? plan.length === 1
            ? `Patched at ${first.universe + 1}.${first.address}.`
            : `Patched ${first.universe + 1}.${first.address} to ${last.universe + 1}.${last.address + channels - 1}${last.universe !== first.universe ? ' (continues into the next universe)' : ''}.`
          : 'No room to patch these.'}
      </p>
      <button className="primary" disabled={!plan.length} onClick={add}>
        Add {count > 1 ? `${count} fixtures` : 'to rig'}
      </button>
      <a className="lib-link" href={`https://open-fixture-library.org/${entry.key}`} target="_blank" rel="noreferrer">
        View on open-fixture-library.org
      </a>
    </div>
  )
}
