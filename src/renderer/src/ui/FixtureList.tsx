/**
 * The fixture list: select, mute, solo, hide, rename and re-patch in place.
 *
 * - Click selects; Shift-click selects a range; Cmd-click adds or removes one.
 * - M / S / eye buttons mute, solo or hide. With several fixtures selected,
 *   pressing one on a selected row applies it to the whole selection.
 * - Double-click a name or patch to edit it. With several selected, a new name
 *   numbers them ("Spot 1", "Spot 2"...) and a new address patches them in a row.
 */
import { useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useMix } from '../state/mix'
import { renameGroup, updateFixtures } from '../state/commands'
import { findOverlaps, fitsInUniverse, footprint, type Fixture } from '../model/project'
import { getFixtureType, plainName } from '../model/fixtureTypes'

export function FixtureList() {
  const fixtures = useStore((s) => s.project.fixtures)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const mix = useMix()
  const [filter, setFilter] = useState('')
  // null = every fixture; 0 = fixtures in no group; n = SoundSwitch group n.
  const [group, setGroup] = useState<number | null>(null)
  const anchor = useRef<string | null>(null)

  const problems = useMemo(() => {
    const ids = new Set<string>()
    for (const [a, b] of findOverlaps(fixtures)) {
      // Same type at the same address is a deliberate copy (it mirrors), not a clash.
      if (a.address === b.address && a.typeId === b.typeId) continue
      ids.add(a.id).add(b.id)
    }
    for (const f of fixtures) if (!fitsInUniverse(f)) ids.add(f.id)
    return ids
  }, [fixtures])

  const shown = fixtures
    .filter((f) => group === null || (f.group ?? 0) === group)
    .filter((f) => !filter || `${f.name} ${getFixtureType(f.typeId).name}`.toLowerCase().includes(filter.toLowerCase()))

  const onRowClick = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && anchor.current) {
      const ids = shown.map((f) => f.id)
      const [a, b] = [ids.indexOf(anchor.current), ids.indexOf(id)].sort((x, y) => x - y)
      select(ids.slice(a, b + 1))
    } else if (e.metaKey || e.ctrlKey) {
      select(selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id])
      anchor.current = id
    } else {
      select([id])
      anchor.current = id
    }
  }

  /** The fixtures a row's button acts on: the whole selection if the row is part of it. */
  const targets = (id: string) => (selection.includes(id) && selection.length > 1 ? selection : [id])

  return (
    <div className="fixture-list">
      <div className="list-head">
        <h2>
          Fixtures <span className="count">{fixtures.length}</span>
        </h2>
        <div className="list-tools">
          <button className="mini" onClick={() => select(shown.map((f) => f.id))} title="Select all (Cmd+A)">
            All
          </button>
          {mix.solo.length > 0 && (
            <button className="mini on-solo" onClick={() => mix.clear('solo')} title="Stop soloing">
              Unsolo
            </button>
          )}
          {mix.muted.length > 0 && (
            <button className="mini on-mute" onClick={() => mix.clear('muted')} title="Unmute everything">
              Unmute
            </button>
          )}
          {mix.hidden.length > 0 && (
            <button className="mini" onClick={() => mix.clear('hidden')} title="Show hidden fixtures">
              Show all
            </button>
          )}
        </div>
      </div>
      <GroupBar group={group} setGroup={setGroup} />
      <input className="filter" placeholder="Filter fixtures…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <table>
        <thead>
          <tr>
            <th className="toggles" />
            <th>Name</th>
            <th>Patch</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((f) => {
            const muted = mix.muted.includes(f.id)
            const solo = mix.solo.includes(f.id)
            const hidden = mix.hidden.includes(f.id)
            const live = mix.isLive(f.id)
            return (
              <tr
                key={f.id}
                className={[selection.includes(f.id) ? 'selected' : '', live ? '' : 'dead', hidden ? 'hidden-row' : ''].join(' ')}
                onClick={(e) => onRowClick(f.id, e)}
              >
                <td className="toggles" onClick={(e) => e.stopPropagation()}>
                  <button className={`tog ${muted ? 'on-mute' : ''}`} title="Mute (M)" onClick={() => mix.toggle('muted', targets(f.id))}>
                    M
                  </button>
                  <button className={`tog ${solo ? 'on-solo' : ''}`} title="Solo (S)" onClick={() => mix.toggle('solo', targets(f.id))}>
                    S
                  </button>
                  <button className={`tog ${hidden ? 'on-hide' : ''}`} title="Hide (H)" onClick={() => mix.toggle('hidden', targets(f.id))}>
                    {hidden ? '◌' : '●'}
                  </button>
                </td>
                <td>
                  {problems.has(f.id) && <span className="warn" title="Patch clash or past channel 512">!</span>}
                  <InlineEdit value={f.name} onCommit={(v) => rename(f, v, targets(f.id))} />
                  <div className="sub">
                    {f.group ? <span className="group-tag">G{f.group}</span> : null}
                    {shortType(f)}
                  </div>
                </td>
                <td className="mono">
                  <InlineEdit value={`${f.universe + 1}.${f.address}`} onCommit={(v) => repatch(f, v, targets(f.id))} />
                  <div className="sub">{footprint(f)} ch</div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="hint">
        Shift-click a range, Cmd-click to add. Double-click a name or patch to edit; with several selected, edits apply to all. Keys: M mute, S solo, H hide, Cmd+D duplicate.
      </p>
    </div>
  )
}

function shortType(f: Fixture): string {
  const name = plainName(getFixtureType(f.typeId).name)
  return name.length > 30 ? name.slice(0, 29) + '…' : name
}

/** A text that turns into an input on double-click; Enter or leaving the field commits. */
function InlineEdit({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (!editing) {
    return (
      <span
        className="inline-edit"
        onDoubleClick={(e) => {
          e.stopPropagation()
          setDraft(value)
          setEditing(true)
        }}
      >
        {value}
      </span>
    )
  }
  const done = (commit: boolean) => {
    setEditing(false)
    if (commit && draft.trim() && draft !== value) onCommit(draft.trim())
  }
  return (
    <input
      className="inline-input"
      autoFocus
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done(true)
        if (e.key === 'Escape') done(false)
      }}
    />
  )
}

/** One fixture: the new name. Several: "<name> 1", "<name> 2"... in list order. */
function rename(f: Fixture, name: string, ids: string[]): void {
  if (ids.length === 1) {
    updateFixtures([f.id], 'Rename', (x) => ({ ...x, name }))
    return
  }
  const base = name.replace(/\s*\d+$/, '')
  const order = useStore.getState().project.fixtures.filter((x) => ids.includes(x.id)).map((x) => x.id)
  updateFixtures(ids, `Rename ${ids.length} fixtures`, (x) => ({ ...x, name: `${base} ${order.indexOf(x.id) + 1}` }))
}

/** "1.17" or "17". One fixture moves there; several are patched in a row from there. */
function repatch(f: Fixture, text: string, ids: string[]): void {
  const match = /^(?:(\d+)\.)?(\d+)$/.exec(text.trim())
  if (!match) return
  // Universes are typed the SoundSwitch way, from 1.
  const universe = match[1] !== undefined ? Math.max(0, Number(match[1]) - 1) : f.universe
  const start = Math.max(1, Math.min(512, Number(match[2])))
  if (ids.length === 1) {
    updateFixtures([f.id], 'Patch', (x) => ({ ...x, universe, address: start }))
    return
  }
  const order = useStore.getState().project.fixtures.filter((x) => ids.includes(x.id))
  const addresses = new Map<string, number>()
  let next = start
  for (const x of order) {
    addresses.set(x.id, next)
    next += footprint(x)
  }
  updateFixtures(ids, `Patch ${ids.length} fixtures in a row`, (x) => ({ ...x, universe, address: addresses.get(x.id) ?? x.address }))
}

/** "BO-IR4 ×3, Spider" — what's in a group, from its fixtures' types. */
function groupSummary(list: Fixture[]): string {
  const counts = new Map<string, number>()
  for (const f of list) {
    const name = shortType(f).split(' ').slice(0, 2).join(' ')
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([n, c]) => (c > 1 ? `${n} ×${c}` : n))
    .join(', ')
}

/**
 * SoundSwitch's fixture groups: pick one to see only its fixtures, then mute,
 * solo, hide or select the whole group. Double-click a group to name it.
 */
function GroupBar({ group, setGroup }: { group: number | null; setGroup: (g: number | null) => void }) {
  const fixtures = useStore((s) => s.project.fixtures)
  const names = useStore((s) => s.project.groupNames)
  const select = useStore((s) => s.select)
  const mix = useMix()
  const [renaming, setRenaming] = useState<number | null>(null)
  const numbers = [...new Set(fixtures.map((f) => f.group ?? 0))].sort((a, b) => (a || 99) - (b || 99))
  if (numbers.length <= 1 && numbers[0] === 0) return null
  const label = (g: number) => (g === 0 ? 'No group' : names?.[g] ?? `Group ${g}`)
  const members = group === null ? [] : fixtures.filter((f) => (f.group ?? 0) === group).map((f) => f.id)
  const state = (key: 'muted' | 'solo' | 'hidden') => members.length > 0 && members.every((id) => mix[key].includes(id))

  return (
    <div className="group-bar">
      <div className="chips">
        <button className={`chip ${group === null ? 'on' : ''}`} onClick={() => setGroup(null)}>
          All
        </button>
        {numbers.map((g) => {
          const list = fixtures.filter((f) => (f.group ?? 0) === g)
          if (renaming === g) {
            return (
              <input
                key={g}
                className="chip-input"
                autoFocus
                defaultValue={label(g)}
                onBlur={(e) => {
                  renameGroup(g, e.target.value === `Group ${g}` ? '' : e.target.value)
                  setRenaming(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setRenaming(null)
                }}
              />
            )
          }
          return (
            <button
              key={g}
              className={`chip ${group === g ? 'on' : ''}`}
              onClick={() => setGroup(group === g ? null : g)}
              onDoubleClick={() => g && setRenaming(g)}
              title={`${label(g)}: ${groupSummary(list)}${g ? '\nDouble-click to name it' : ''}`}
            >
              {label(g)}
              <span className="chip-count">{list.length}</span>
            </button>
          )
        })}
      </div>
      {group !== null && members.length > 0 && (
        <div className="group-actions">
          <span className="hint">{groupSummary(fixtures.filter((f) => members.includes(f.id)))}</span>
          <button className="mini" onClick={() => select(members)} title="Select every fixture in this group">
            Select
          </button>
          <button className={`mini ${state('muted') ? 'on-mute' : ''}`} onClick={() => mix.toggle('muted', members)} title="Mute the group">
            M
          </button>
          <button className={`mini ${state('solo') ? 'on-solo' : ''}`} onClick={() => mix.toggle('solo', members)} title="Solo the group: only it acts">
            S
          </button>
          <button className={`mini ${state('hidden') ? 'on' : ''}`} onClick={() => mix.toggle('hidden', members)} title="Hide the group">
            Hide
          </button>
        </div>
      )}
    </div>
  )
}
