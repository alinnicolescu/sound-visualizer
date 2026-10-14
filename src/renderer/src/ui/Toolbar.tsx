import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { useViewSettings } from '../state/viewSettings'
import { dmxBus } from '../state/dmxBus'
import { runCommand } from '../state/menuCommands'
import { useWizards } from '../state/wizards'
import { followSoundSwitch } from '../state/commands'
import { TEMPLATES } from '../state/shows'
import { saveDocument, useDocument } from '../state/document'
import type { ArtNetStatus } from '../../../shared/ipc'
import { useSoundSwitch } from '../state/soundswitchLink'

export function Toolbar({ artNet }: { artNet: ArtNetStatus | null }) {
  const past = useStore((s) => s.past)
  const future = useStore((s) => s.future)
  const selection = useStore((s) => s.selection)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const haze = useViewSettings((s) => s.haze)
  const setHaze = useViewSettings((s) => s.setHaze)
  const leftTab = useViewSettings((s) => s.leftTab)
  const setLeftTab = useViewSettings((s) => s.setLeftTab)
  const builder = useViewSettings((s) => s.builder)

  return (
    <header className="toolbar">
      <div className="brand">Sound Visualizer</div>
      <div className="group">
        <button className={leftTab === 'library' ? 'primary' : ''} onClick={() => setLeftTab(leftTab === 'library' ? 'fixtures' : 'library')} title="Browse the fixture library (Cmd+L)">
          + Add fixtures
        </button>
        <button disabled={selection.length === 0} onClick={() => runCommand('duplicate')} title="Same patch, mirrors the original (Cmd+D)">
          Duplicate
        </button>
        <button disabled={selection.length === 0} onClick={() => runCommand('delete')}>
          Delete
        </button>
      </div>
      <div className="group">
        <button className={builder ? 'primary' : ''} onClick={() => runCommand('builder')} title="Describe a show and have it built for you (Cmd+K)">
          ✦ Build show
        </button>
        <ShowsMenu />
      </div>
      <div className="group">
        <button disabled={!past.length} onClick={undo} title={past.at(-1) ? `Undo ${past.at(-1)!.label}` : 'Nothing to undo'}>
          Undo
        </button>
        <button disabled={!future.length} onClick={redo} title={future[0] ? `Redo ${future[0].label}` : 'Nothing to redo'}>
          Redo
        </button>
      </div>
      <label className="group haze">
        Haze
        <input type="range" min={0} max={1} step={0.01} value={haze} onChange={(e) => setHaze(Number(e.target.value))} />
      </label>
      <div className="spacer" />
      <SoundSwitchIndicator />
      <ArtNetIndicator status={artNet} />
      <SaveButton />
    </header>
  )
}

/** Templates, importing and exporting shows (also in the File menu). */
function ShowsMenu() {
  const [open, setOpen] = useState(false)
  const run = (command: string) => () => {
    setOpen(false)
    runCommand(command)
  }
  return (
    <div className="dropdown">
      <button className={open ? 'on' : ''} onClick={() => setOpen(!open)} title="Start from a ready-made show, import or export">
        Shows ▾
      </button>
      {open && (
        <>
          <div className="menu-backdrop fixed" onPointerDown={() => setOpen(false)} />
          <div className="dropdown-menu shows-menu">
            <button className="menu-item" onClick={run('new')}>
              <span className="menu-label">New show… (from SoundSwitch, scratch or the demo)</span>
            </button>
            <hr />
            <div className="menu-title">Start from</div>
            {TEMPLATES.map((t) => (
              <button key={t.id} className="menu-item" title={t.description} onClick={run(`template:${t.id}`)}>
                <span className="menu-label">{t.name}</span>
              </button>
            ))}
            {window.api && (
              <>
                <hr />
                <button className="menu-item" onClick={run('importShow')}>
                  <span className="menu-label">Import show into this one…</span>
                </button>
                <button className="menu-item" onClick={run('openMvr')}>
                  <span className="menu-label">Open MVR…</span>
                </button>
                <button className="menu-item" onClick={run('exportMvr')}>
                  <span className="menu-label">Export MVR (Capture, grandMA3…)…</span>
                </button>
                <button className="menu-item" onClick={run('exportCsv')}>
                  <span className="menu-label">Export patch list (CSV)…</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Save, with a dot while there are unsaved changes. Hover shows the file. */
function SaveButton() {
  const path = useDocument((s) => s.path)
  const saved = useDocument((s) => s.saved)
  const project = useStore((s) => s.project)
  if (!window.api) return null
  const edited = saved !== project
  return (
    <button onClick={() => void saveDocument(false)} title={path ? `${path}${edited ? '\nUnsaved changes' : ''}` : 'Save this project to a file (Cmd+S)'}>
      {edited ? '● ' : ''}Save
    </button>
  )
}

/** Shows whether Art-Net is being received. Polls twice a second instead of re-rendering per packet. */
function ArtNetIndicator({ status }: { status: ArtNetStatus | null }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [])

  let text = 'Art-Net: browser only'
  let tone = 'off'
  if (status?.error) {
    text = `Art-Net error: ${status.error}`
    tone = 'bad'
  } else if (status?.listening) {
    const active = dmxBus.artNetActive()
    const sender = dmxBus.artNetSenders().at(-1)
    const shift = dmxBus.universeOffset()
    text = active && sender
      ? `Art-Net: receiving from ${sender.address}, Art-Net universe ${sender.universes.join(', ')}${shift ? ` (shifted ${shift > 0 ? '-' : '+'}${Math.abs(shift)} to match)` : ''}`
      : `Art-Net: listening on ${status.address}`
    tone = active ? 'good' : 'idle'
  }
  return <div className={`status ${tone}`}>{text}</div>
}

/** Which SoundSwitch project we follow, with buttons to sync, re-find or pick one. */
function SoundSwitchIndicator() {
  const status = useSoundSwitch((s) => s.status)
  const autoSync = useSoundSwitch((s) => s.autoSync)
  const setAutoSync = useSoundSwitch((s) => s.setAutoSync)
  const syncNow = useSoundSwitch((s) => s.syncNow)
  const link = useStore((s) => s.project.soundswitch)
  const inShow = useStore((s) => s.project.fixtures.filter((f) => f.soundswitchKey).length)
  if (!window.api) return null
  // This show doesn't follow SoundSwitch, or follows a different project.
  if (status?.state === 'linked' && link && (!link.link || (link.profile && link.profile !== status.name))) {
    const other = link.link && link.profile
    return (
      <div className="group">
        <div className="status off" title={other ? `This show follows the SoundSwitch project “${link.profile}”. SoundSwitch has “${status.name}” open, so nothing is synced.` : 'This show was made without SoundSwitch, so SoundSwitch patch changes are not brought in.'}>
          {other ? `Show follows “${link.profile}” · SoundSwitch has “${status.name}”` : `SoundSwitch: ${status.name} · not used by this show`}
        </div>
        {!other && (
          <button className="quiet" title="Bring this SoundSwitch project's fixtures into this show and follow its patch" onClick={() => followSoundSwitch(status.name)}>
            Follow it
          </button>
        )}
        <button className="quiet" onClick={() => useWizards.getState().openNewShow()} title="Make a show from a SoundSwitch project, choosing its fixtures">
          New show…
        </button>
      </div>
    )
  }

  let text = 'SoundSwitch: looking…'
  let tone = 'off'
  let title = ''
  if (status?.state === 'linked') {
    text = link?.include ? `SoundSwitch: ${status.name} · ${inShow} of ${status.fixtures.length} fixtures in this show` : `SoundSwitch: ${status.name} · ${status.fixtures.length} fixtures${status.hidden ? ` (${status.hidden} hidden)` : ''}`
    tone = 'good'
    title = `${status.project}\nFound because it is ${status.how}.${status.hidden ? `\n${status.hidden} fixture(s) left out by soundswitch-exclude.json.` : ''}`
  } else if (status?.state === 'not found') {
    text = 'SoundSwitch: no project found'
  } else if (status?.state === 'error') {
    text = `SoundSwitch: ${status.error}`
    tone = 'bad'
  }
  return (
    <div className="group">
      <div className={`status ${tone}`} title={title}>
        {text}
      </div>
      <label className="auto" title="Update the rig whenever the SoundSwitch patch changes">
        <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} /> Auto
      </label>
      {!autoSync && status?.state === 'linked' && <button onClick={syncNow}>Sync</button>}
      <button className="quiet" onClick={() => window.api?.refreshSoundSwitch()} title="Find the project SoundSwitch has open">
        Find
      </button>
      <button className="quiet" onClick={() => window.api?.chooseSoundSwitchProject()}>
        Choose…
      </button>
    </div>
  )
}
