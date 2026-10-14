/**
 * The Set tab: totems, stands, truss, staging, tables, drape and speakers.
 * Click a piece to add it (it goes to the front of the stage, beside anything
 * already there), or drag it into the 3D view to put it exactly where you want.
 * Below: what's in the set, and what's attached to each piece.
 */
import { useMemo, type ReactElement } from 'react'
import { useStore } from '../state/store'
import { addStructure, deleteStructures } from '../state/commands'
import { FT, STRUCTURE_KINDS, STRUCTURE_PRESETS, type KindInfo, type StructureKind, type StructureParams } from '../model/structures'
import { view } from '../state/viewBus'

export const STRUCTURE_DRAG = 'application/x-ssvis-structure'
export interface StructureDrag {
  kind: StructureKind
  params: StructureParams
}

const ORDER: KindInfo['category'][] = ['Totems & stands', 'Truss', 'Staging', 'DJ & furniture', 'Drape', 'Audio']

export function SetPanel() {
  const structures = useStore((s) => s.project.structures ?? [])
  const fixtures = useStore((s) => s.project.fixtures)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)

  const byCategory = useMemo(() => {
    const m = new Map<KindInfo['category'], typeof STRUCTURE_PRESETS>()
    for (const p of STRUCTURE_PRESETS) {
      const c = STRUCTURE_KINDS[p.kind].category
      m.set(c, [...(m.get(c) ?? []), p])
    }
    return ORDER.map((c) => [c, m.get(c) ?? []] as const)
  }, [])

  return (
    <div className="set-panel">
      <div className="list-head">
        <h2>
          Set <span className="count">{structures.length}</span>
        </h2>
      </div>
      <p className="hint">Click to add, or drag into the view. Then drag a fixture onto a piece (Move tool, W) to attach it.</p>
      {byCategory.map(([category, presets]) => (
        <div key={category} className="set-group">
          <div className="set-cat">{category}</div>
          <div className="set-presets">
            {presets.map((p) => (
              <button
                key={p.name}
                className="set-preset"
                draggable
                title={STRUCTURE_KINDS[p.kind].description}
                onDragStart={(e) => {
                  e.dataTransfer.setData(STRUCTURE_DRAG, JSON.stringify({ kind: p.kind, params: p.params } satisfies StructureDrag))
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => addStructure(p.kind, p.params)}
              >
                <Icon kind={p.kind} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="set-cat">In this set</div>
      {structures.length === 0 && <p className="hint">Nothing yet: fixtures stand on the floor.</p>}
      <ul className="set-list">
        {structures.map((s) => {
          const on = fixtures.filter((f) => f.mount?.structure === s.id).length
          return (
            <li
              key={s.id}
              className={selection.includes(s.id) ? 'selected' : ''}
              onClick={(e) => select(e.shiftKey || e.metaKey ? (selection.includes(s.id) ? selection.filter((x) => x !== s.id) : [...selection, s.id]) : [s.id])}
              onDoubleClick={() => view.focus([s.id])}
            >
              <Icon kind={s.kind} />
              <span className="name">{s.name}</span>
              <span className="sub">{on ? `${on} fixture${on > 1 ? 's' : ''}` : ''}</span>
              <button className="mini" title="Delete (what's on it falls to the floor)" onClick={(e) => (e.stopPropagation(), deleteStructures([s.id]))}>
                ✕
              </button>
            </li>
          )
        })}
      </ul>
      <p className="hint">Sizes in feet. 1 ft = {Math.round(FT * 1000) / 1000} m.</p>
    </div>
  )
}

/** A small line drawing of each kind of piece. */
export function Icon({ kind }: { kind: StructureKind }) {
  const s = { stroke: 'currentColor', fill: 'none', strokeWidth: 1.4, strokeLinecap: 'round' as const }
  const paths: Record<StructureKind, ReactElement> = {
    totem: <><rect x="9" y="3" width="6" height="16" {...s} /><path d="M6 21h12M10 6l4 4M14 10l-4 4M10 14l4 4" {...s} /></>,
    flexstand: <><path d="M12 4v15M6 21h12M9 4h6" {...s} /></>,
    tubeStand: <><path d="M12 3v16M8 21h8" {...s} /><rect x="10.5" y="2" width="3" height="6" {...s} /></>,
    tbar: <><path d="M5 5h14M12 5v11M12 16l-5 5M12 16l5 5M12 16v5" {...s} /></>,
    goalpost: <><path d="M4 21V5h16v16M4 8h16" {...s} /></>,
    trussBox: <><path d="M4 21V7l4-3h12v14l-4 3M4 7h12v14M16 7l4-3" {...s} /></>,
    groundTruss: <><path d="M3 15h18M3 19h18M5 15l3 4 3-4 3 4 3-4 3 4" {...s} /></>,
    stage: <><path d="M3 11h18v4H3zM5 15v5M19 15v5M12 11v4" {...s} /></>,
    table: <><path d="M3 10h18M6 10v10M18 10v10" {...s} /></>,
    djBooth: <><rect x="3" y="8" width="18" height="12" {...s} /><path d="M9 8v12M15 8v12M3 8l2-3h14l2 3" {...s} /></>,
    pipeDrape: <><path d="M4 4v17M20 4v17M4 5h16M7 5c0 6 1 11 0 16M11 5c0 6 1 11 0 16M15 5c0 6 1 11 0 16" {...s} /></>,
    speakerColumn: <><rect x="8" y="14" width="8" height="7" {...s} /><rect x="10.5" y="3" width="3" height="9" {...s} /></>,
    speakerOnPole: <><rect x="7" y="3" width="10" height="9" {...s} /><path d="M12 12v5M12 17l-5 4M12 17l5 4" {...s} /></>,
    sub: <><rect x="4" y="7" width="16" height="13" {...s} /><circle cx="12" cy="13.5" r="4" {...s} /></>
  }
  return (
    <svg className="set-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      {paths[kind]}
    </svg>
  )
}
