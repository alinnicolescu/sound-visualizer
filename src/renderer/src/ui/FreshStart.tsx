/**
 * Starting as a new user.
 *  - First launch on a Mac: the welcome tour, then New Show (see wizards.ts).
 *  - The app was reinstalled or updated on a Mac that used it before: "Welcome
 *    back", carry on with the last show, or start fresh.
 *  - Help ▸ Start Fresh as a New User…: the same fresh start, any time.
 *
 * Starting fresh forgets the open show, the panels and tours, and this Mac's
 * SoundSwitch choices, then the app reloads as if it had just been installed.
 * Saved show files are never touched.
 */
import { useEffect, useState } from 'react'
import { useWizards, welcomeSeen } from '../state/wizards'

/** On launch: first time here, or back after a reinstall? */
export function useFirstLaunch(): void {
  useEffect(() => {
    if (!welcomeSeen()) {
      useWizards.getState().startFirstRun()
      return
    }
    void window.api?.installInfo().then((info) => {
      if (info.changed) useWizards.getState().openWelcomeBack(info)
    })
  }, [])
}

export async function startFresh(options: { claudeKey: boolean; importedFixtures: boolean }): Promise<void> {
  try {
    await window.api?.freshStart(options)
  } finally {
    try {
      localStorage.clear()
    } catch {
      // Nothing stored: already fresh.
    }
    // Start again exactly as a new install would.
    location.reload()
  }
}

export function WelcomeBack() {
  const info = useWizards((s) => s.welcomeBack)
  const close = useWizards((s) => s.closeWelcomeBack)
  const ask = useWizards((s) => s.askFreshStart)
  if (!info) return null
  const updated = info.previousVersion && info.previousVersion !== info.version
  return (
    <div className="wizard-backdrop">
      <div className="wizard small-dialog" role="dialog" aria-label="Welcome back">
        <h2>{updated ? `Sound Visualizer ${info.version}` : 'Welcome back'}</h2>
        <p>
          {updated
            ? `This Mac was using version ${info.previousVersion}. Your last show and settings are still here.`
            : 'Sound Visualizer was installed again on this Mac. Your last show and settings are still here.'}
        </p>
        <p className="soft">Carry on where you left off, or start fresh as a new user: an empty show, the welcome tour and the guided tours, as if it had just been installed.</p>
        <div className="wizard-foot">
          <button onClick={ask}>Start fresh…</button>
          <span className="spacer" />
          <button className="primary" autoFocus onClick={close}>
            Carry on
          </button>
        </div>
      </div>
    </div>
  )
}

export function FreshStartConfirm() {
  const open = useWizards((s) => s.freshStart)
  const close = useWizards((s) => s.closeFreshStart)
  const [claudeKey, setClaudeKey] = useState(false)
  const [importedFixtures, setImportedFixtures] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])
  if (!open) return null
  return (
    <div className="wizard-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="wizard small-dialog" role="dialog" aria-label="Start fresh">
        <h2>Start fresh as a new user?</h2>
        <p>The app starts again as if it had just been installed: an empty show, then the welcome tour and New Show.</p>
        <ul className="fresh-list">
          <li>The show that's open now is cleared. <b>Shows you saved to files aren't touched</b>, so save this one first if you want it.</li>
          <li>The SoundSwitch project this Mac follows, and fixtures you left out of it, are forgotten.</li>
          <li>Panel settings, recent fixtures and the tours you've done are reset.</li>
        </ul>
        {window.api && (
          <div className="fresh-options">
            <label className="check">
              <input type="checkbox" checked={claudeKey} onChange={(e) => setClaudeKey(e.target.checked)} /> Also remove my Claude key
            </label>
            <label className="check">
              <input type="checkbox" checked={importedFixtures} onChange={(e) => setImportedFixtures(e.target.checked)} /> Also remove fixture files I imported
            </label>
          </div>
        )}
        <div className="wizard-foot">
          <button className="quiet" onClick={close}>
            Cancel
          </button>
          <span className="spacer" />
          <button
            className="primary caution"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void startFresh({ claudeKey, importedFixtures })
            }}
          >
            {busy ? 'Starting fresh…' : 'Start fresh'}
          </button>
        </div>
      </div>
    </div>
  )
}
