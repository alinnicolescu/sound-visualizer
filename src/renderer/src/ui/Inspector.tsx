/**
 * A generic inspector: it knows nothing about fixtures. It draws a field for
 * each property descriptor and edits every selected fixture at once.
 */
import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { orientFixtures, updateFixtures } from '../state/commands'
import { notify } from '../state/notices'
import { FIXTURE_PROPERTIES, type PropertyDescriptor } from '../state/properties'
import { findOverlaps, fitsInUniverse, footprint, type Fixture } from '../model/project'
import { getFixtureType } from '../model/fixtureTypes'
import { ArrangePanel } from './ArrangePanel'
import { ArrangeButtons } from './ArrangeMenu'
import { FixtureMount, StructureInspector } from './StructureActions'

export function Inspector() {
  const fixtures = useStore((s) => s.project.fixtures)
  const selection = useStore((s) => s.selection)
  const structures = useStore((s) => s.project.structures)
  const selected = fixtures.filter((f) => selection.includes(f.id))
  const pieces = (structures ?? []).filter((s) => selection.includes(s.id))

  if (selected.length === 0 && pieces.length) return <StructureInspector chosen={pieces} />
  if (selected.length === 0) {
    return (
      <div className="inspector">
        <h2>Inspector</h2>
        <p className="hint">Select a fixture in the list or the 3D view.</p>
      </div>
    )
  }

  const clashes = findOverlaps(fixtures).filter(([a, b]) => selection.includes(a.id) || selection.includes(b.id))
  const overflow = selected.filter((f) => !fitsInUniverse(f))

  return (
    <div className="inspector">
      <h2>{selected.length === 1 ? selected[0].name : `${selected.length} fixtures`}</h2>
      {pieces.length > 0 && <p className="hint">Also selected: {pieces.length === 1 ? pieces[0].name : `${pieces.length} objects`}. Moving and lining up takes them all.</p>}
      {clashes.map(([a, b]) => (
        <p key={a.id + b.id} className="problem">
          {a.name} and {b.name} share channels in universe {a.universe + 1}.
        </p>
      ))}
      {overflow.map((f) => (
        <p key={f.id} className="problem">
          {f.name} runs past channel 512.
        </p>
      ))}
      {selected.length === 1 && <TypeInfo fixture={selected[0]} />}
      <FixtureMount fixtures={selected} />
      <ArrangeButtons ids={selection} />
      {FIXTURE_PROPERTIES.map(({ section, properties }) => (
        <fieldset key={section}>
          <legend>{section}</legend>
          {properties.map((p) => (
            <Field key={p.key} property={p} fixtures={selected} />
          ))}
        </fieldset>
      ))}
      <ArrangePanel ids={selection} />
    </div>
  )
}

function Field({ property, fixtures }: { property: PropertyDescriptor; fixtures: Fixture[] }) {
  const values = fixtures.map((f) => property.get(f) as string | number | boolean)
  const mixed = values.some((v) => v !== values[0])
  const shown = mixed ? '' : String(values[0])
  const ids = fixtures.map((f) => f.id)

  // Text and number fields keep a local draft and commit on Enter or when you leave the field,
  // so typing "120" is one undo step, not three.
  const [draft, setDraft] = useState(shown)
  useEffect(() => setDraft(shown), [shown])

  const commit = (raw: string) => {
    if (raw === shown) return
    if (property.kind === 'number') {
      const n = Number(raw)
      if (raw.trim() === '' || Number.isNaN(n)) return setDraft(shown)
      const v = Math.max(property.min, Math.min(property.max, n))
      updateFixtures(ids, `Set ${property.label}`, (f) => property.set(f, v))
    } else if (property.kind === 'text') {
      updateFixtures(ids, `Set ${property.label}`, (f) => property.set(f, raw))
    }
  }

  return (
    <label className="field">
      <span className="label">
        {property.label}
        {property.kind === 'number' && property.unit ? ` (${property.unit})` : ''}
      </span>
      {property.kind === 'boolean' ? (
        <span className="check">
          <input
            type="checkbox"
            checked={!mixed && values[0] === (true as unknown)}
            ref={(el) => {
              if (el) el.indeterminate = mixed
            }}
            onChange={(e) => updateFixtures(ids, `Set ${property.label}`, (f) => property.set(f, e.target.checked))}
          />
          {mixed ? 'Mixed' : values[0] ? 'On' : 'Off'}
        </span>
      ) : property.kind === 'select' ? (
        <select
          value={mixed ? '' : String(values[0])}
          onChange={(e) => {
            // Hanging needs a truss: go through the command that finds one.
            if (property.key === 'mounting') {
              const stuck = orientFixtures(ids, e.target.value as 'hanging' | 'floor')
              if (stuck.length) notify('error', `Nothing to hang ${stuck.join(', ')} from: add a truss in the Objects tab.`)
            } else updateFixtures(ids, `Set ${property.label}`, (f) => property.set(f, e.target.value))
          }}
        >
          {mixed && <option value="">Mixed</option>}
          {property.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={property.kind === 'number' ? 'number' : 'text'}
          step={property.kind === 'number' ? property.step : undefined}
          placeholder={mixed ? 'Mixed' : ''}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setDraft(shown)
          }}
        />
      )}
      {property.hint && <span className="hint">{property.hint}</span>}
    </label>
  )
}

/** What the fixture is: make, model, mode, real size and where it's patched. */
function TypeInfo({ fixture }: { fixture: Fixture }) {
  const type = getFixtureType(fixture.typeId)
  const size = type.spec?.size
  const end = fixture.address + footprint(fixture) - 1
  return (
    <div className="type-info">
      <div>{type.name}</div>
      <div className="sub">
        {[type.manufacturer, type.source].filter(Boolean).join(' · ')}
        {size ? ` · ${size.map((v) => Math.round(v * 1000)).join(' × ')} mm` : ''}
      </div>
      <div className="sub">
        Universe {fixture.universe + 1}, channels {fixture.address}–{end} ({footprint(fixture)} ch)
      </div>
    </div>
  )
}
