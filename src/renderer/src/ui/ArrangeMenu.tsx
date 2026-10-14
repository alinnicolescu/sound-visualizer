/**
 * One-click arranging for whatever is selected, objects and fixtures alike:
 * move the group somewhere on the stage, line things up evenly, align their
 * edges, or even out the gaps. Stands bring their fixtures, stages bring what's
 * on them. Used in the right-click menus and the inspector.
 */
import { alignSelection, lineUpSelection, placeSelection, spaceSelection, unitCount } from '../state/commands'
import { notify } from '../state/notices'
import { MenuItem, SubMenu } from './Menu'

const done = (moved: boolean) => !moved && notify('info', 'Already there.')

export function ArrangeMenu({ ids, run }: { ids: string[]; run: (action: () => void) => () => void }) {
  const n = unitCount(ids)
  if (!n) return null
  return (
    <>
      <SubMenu label="Move to">
        <MenuItem label="Back of the stage" onClick={run(() => done(placeSelection(ids, 'back')))} />
        <MenuItem label="Centre of the stage" onClick={run(() => done(placeSelection(ids, 'centre')))} />
        <MenuItem label="Front of the stage" onClick={run(() => done(placeSelection(ids, 'front')))} />
        <MenuItem label="Left side" title="Left as the audience sees it" onClick={run(() => done(placeSelection(ids, 'left')))} />
        <MenuItem label="Right side" title="Right as the audience sees it" onClick={run(() => done(placeSelection(ids, 'right')))} />
        <MenuItem label="In front of the stage" onClick={run(() => done(placeSelection(ids, 'audience')))} />
      </SubMenu>
      <SubMenu label={n > 1 ? `Line up ${n} evenly` : 'Line up'} disabled={n < 2}>
        <MenuItem label="Across the back of the stage" onClick={run(() => done(lineUpSelection(ids, 'back')))} />
        <MenuItem label="Across the front of the stage" onClick={run(() => done(lineUpSelection(ids, 'front')))} />
        <MenuItem label="In front of the stage" onClick={run(() => done(lineUpSelection(ids, 'audience')))} />
        <MenuItem label="In a row, where they are" onClick={run(() => done(lineUpSelection(ids, 'here')))} />
      </SubMenu>
      <SubMenu label="Align" disabled={n < 2}>
        <MenuItem label="Left edges" onClick={run(() => done(alignSelection(ids, 'left')))} />
        <MenuItem label="Centres, left to right" onClick={run(() => done(alignSelection(ids, 'centreX')))} />
        <MenuItem label="Right edges" onClick={run(() => done(alignSelection(ids, 'right')))} />
        <hr />
        <MenuItem label="Back edges" onClick={run(() => done(alignSelection(ids, 'back')))} />
        <MenuItem label="Centres, front to back" onClick={run(() => done(alignSelection(ids, 'centreZ')))} />
        <MenuItem label="Front edges" onClick={run(() => done(alignSelection(ids, 'front')))} />
      </SubMenu>
      <SubMenu label="Space evenly" disabled={n < 3}>
        <MenuItem label="Left to right" onClick={run(() => done(spaceSelection(ids, 'x')))} />
        <MenuItem label="Front to back" onClick={run(() => done(spaceSelection(ids, 'z')))} />
      </SubMenu>
    </>
  )
}

/** The same actions as buttons, for the inspector. */
export function ArrangeButtons({ ids }: { ids: string[] }) {
  const n = unitCount(ids)
  if (!n) return null
  const b = (label: string, title: string, action: () => boolean, disabled = false) => (
    <button className="mini" title={title} disabled={disabled} onClick={() => done(action())}>
      {label}
    </button>
  )
  return (
    <fieldset className="arrange quick">
      <legend>Move and line up</legend>
      <div className="field">
        <span className="label">Move to</span>
        <div className="presets">
          {b('Back', 'The back of the stage, keeping their arrangement', () => placeSelection(ids, 'back'))}
          {b('Centre', 'The centre of the stage', () => placeSelection(ids, 'centre'))}
          {b('Front', 'The front of the stage', () => placeSelection(ids, 'front'))}
          {b('Left', 'The left side, as the audience sees it', () => placeSelection(ids, 'left'))}
          {b('Right', 'The right side, as the audience sees it', () => placeSelection(ids, 'right'))}
          {b('Off front', 'In front of the stage', () => placeSelection(ids, 'audience'))}
        </div>
      </div>
      <div className="field">
        <span className="label">Line up evenly</span>
        <div className="presets">
          {b('Across back', 'An evenly spaced row across the back of the stage', () => lineUpSelection(ids, 'back'), n < 2)}
          {b('Across front', 'An evenly spaced row across the front of the stage', () => lineUpSelection(ids, 'front'), n < 2)}
          {b('Where they are', 'An evenly spaced row where they are now', () => lineUpSelection(ids, 'here'), n < 2)}
        </div>
      </div>
      <div className="field">
        <span className="label">Align</span>
        <div className="presets">
          {b('Fronts', 'Line up their front edges', () => alignSelection(ids, 'front'), n < 2)}
          {b('Centres', 'Line up their centres, front to back', () => alignSelection(ids, 'centreZ'), n < 2)}
          {b('Backs', 'Line up their back edges', () => alignSelection(ids, 'back'), n < 2)}
          {b('Even gaps', 'Equal gaps between them, left to right', () => spaceSelection(ids, 'x'), n < 3)}
        </div>
      </div>
    </fieldset>
  )
}
