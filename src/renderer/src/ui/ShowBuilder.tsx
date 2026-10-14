/**
 * "Describe your show": type (or dictate) what you want, and the rig is built
 * for you, objects, fixtures, patch and all, as one undo step.
 *
 * Two ways to build, chosen above the box: add to the show that's open, or
 * start a new one (the scene is cleared first; Undo brings it all back).
 *
 * With Claude connected (your Anthropic API key, kept encrypted by the app),
 * anything you describe works. Without it, the built-in reader handles the
 * common requests: "<count> <fixture> on <height> totems / FLEXstands / the
 * truss, one each side of the stage, invert one".
 */
import { useEffect, useRef, useState } from 'react'
import { useViewSettings } from '../state/viewSettings'
import { useLibrary } from '../state/library'
import { useStore } from '../state/store'
import { buildWithClaude, quickPlan, runQuickPlan, type ClaudeTransport, type LibraryAccess } from '../state/showBuilder'
import { view } from '../state/viewBus'

const EXAMPLES = [
  'Two Both Lighting 100 watt moving heads on 6 ft totems, one each side of the stage, the right one with pan inverted',
  'Four MH-150s on the truss',
  'A pair of Spider Wash on FLEXstands either side of the stage',
  'An 8 × 12 ft stage, 2 ft high with a black skirt, a DJ booth on it, and six SQ-9 uplights along the front'
]

type Line = { kind: 'you' | 'step' | 'reply' | 'error'; text: string }

export function ShowBuilder() {
  const open = useViewSettings((s) => s.builder)
  const setOpen = useViewSettings((s) => s.setBuilder)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<Line[]>([])
  const [claude, setClaude] = useState<{ connected: boolean; encryption: boolean } | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [checking, setChecking] = useState(false)
  const [mode, setMode] = useState<'add' | 'replace'>('add')
  const input = useRef<HTMLTextAreaElement>(null)
  const fixtureCount = useStore((s) => s.project.fixtures.length)
  const objectCount = useStore((s) => (s.project.structures ?? []).length)
  const empty = fixtureCount + objectCount === 0

  useEffect(() => {
    if (!open) return
    void useLibrary.getState().load()
    window.api?.claudeStatus().then(setClaude)
    setTimeout(() => input.current?.focus(), 0)
  }, [open])

  if (!open) return null
  const add = (line: Line) => setLog((l) => [...l.slice(-30), line])

  const build = async () => {
    const prompt = text.trim()
    if (!prompt || busy) return
    setBusy(true)
    const replacing = mode === 'replace' && !empty
    add({ kind: 'you', text: replacing ? `New show: ${prompt}` : prompt })
    // Starting over: clear the scene first, all inside one undo step with the build.
    const outer = replacing ? useStore.getState().beginBatch() : null
    if (replacing) {
      // A show built from a description doesn't follow SoundSwitch (it would refill the rig).
      useStore.getState().apply('Clear the scene', (p) => ({ ...p, fixtures: [], structures: [], soundswitch: { link: false } }))
      useStore.getState().select([])
    }
    const before = new Set([...useStore.getState().project.fixtures.map((f) => f.id), ...(useStore.getState().project.structures ?? []).map((s) => s.id)])
    let built = false
    try {
      await useLibrary.getState().load()
      const { library, entries } = useLibrary.getState()
      const lib: LibraryAccess | null = library ? { library, entries } : null
      const label = `Build: ${prompt.slice(0, 40)}${prompt.length > 40 ? '…' : ''}`
      let done = false
      if (claude?.connected && window.api) {
        const send: ClaudeTransport = async (body) => {
          const r = await window.api!.claudeRequest(body)
          if (!r.ok) throw new Error(r.error)
          return r.response as Awaited<ReturnType<ClaudeTransport>>
        }
        try {
          const reply = await buildWithClaude(prompt, lib, send, (step) => add({ kind: 'step', text: step }))
          add({ kind: 'reply', text: reply })
          done = true
        } catch (error) {
          add({ kind: 'error', text: `Claude: ${(error as Error).message}. Trying the built-in reader.` })
        }
      }
      if (!done) {
        const plan = lib && quickPlan(prompt, lib)
        if (!plan) {
          add({ kind: 'error', text: claude?.connected ? "The built-in reader couldn't follow that one either." : "I couldn't follow that one. Try the form “two <fixture> on 6 ft totems, one each side of the stage”, or connect Claude below to build anything you describe." })
        } else {
          add({ kind: 'step', text: `Understood: ${plan.understood.join('; ')}` })
          const ids = runQuickPlan(plan, lib!, label)
          const p = useStore.getState().project
          const added = p.fixtures.filter((f) => ids.includes(f.id))
          add({ kind: 'reply', text: added.length ? `Added ${added.map((f) => `${f.name} (U${f.universe + 1}.${f.address})`).join(', ')}.` : 'Nothing was added.' })
        }
      }
      // Select and frame what's new.
      const p = useStore.getState().project
      const fresh = [...p.fixtures.map((f) => f.id), ...(p.structures ?? []).map((s) => s.id)].filter((id) => !before.has(id))
      if (fresh.length) {
        built = true
        useStore.getState().select(p.fixtures.filter((f) => fresh.includes(f.id)).map((f) => f.id))
        // A new show: the usual starting view of all of it. Added to a show: frame what's new.
        if (replacing || before.size === 0) view.home()
        else view.focus(fresh)
        // Once there's a show, the next request adds to it unless you say otherwise.
        setMode('add')
      }
      setText('')
    } finally {
      if (outer) {
        if (built) useStore.getState().endBatch(outer, `New show: ${prompt.slice(0, 40)}${prompt.length > 40 ? '…' : ''}`)
        else {
          // Nothing was built: put the old show back as it was.
          useStore.setState({ project: outer.project, past: outer.past })
          add({ kind: 'step', text: 'Your show was left as it was.' })
        }
      }
      setBusy(false)
    }
  }

  const saveKey = async (key = keyDraft) => {
    if (!window.api || checking) return
    setChecking(true)
    const r = await window.api.setClaudeKey(key).finally(() => setChecking(false))
    if (r.error) add({ kind: 'error', text: r.error })
    else {
      setKeyDraft('')
      setShowKey(false)
      add({ kind: 'step', text: 'Claude is connected. Describe any show.' })
    }
    setClaude(await window.api.claudeStatus())
  }

  return (
    <div className="builder" data-tour="builder" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="builder-head">
        <strong>Describe your show</strong>
        <span className={`builder-mode ${claude?.connected ? 'on' : ''}`} title={claude?.connected ? 'Requests go to Claude (Anthropic API)' : 'The built-in reader: common requests only'}>
          {claude?.connected ? 'Claude' : 'Built-in reader'}
        </span>
        <button className="mini" onClick={() => setOpen(false)} title="Close (Esc)">
          ✕
        </button>
      </div>
      {log.length > 0 && (
        <div className="builder-log">
          {log.map((l, i) => (
            <div key={i} className={`builder-line ${l.kind}`}>
              {l.text}
            </div>
          ))}
          {busy && <div className="builder-line step">Working…</div>}
        </div>
      )}
      {!empty && (
        <div className="builder-target" data-tour="builder-target" role="radiogroup" aria-label="Where to build">
          <button role="radio" aria-checked={mode === 'add'} className={mode === 'add' ? 'on' : ''} onClick={() => setMode('add')}>
            <strong>＋ Add to this show</strong>
            <span>
              Keeps the {fixtureCount} fixture{fixtureCount === 1 ? '' : 's'} and {objectCount} object{objectCount === 1 ? '' : 's'} already here
            </span>
          </button>
          <button role="radio" aria-checked={mode === 'replace'} className={mode === 'replace' ? 'on replace' : ''} onClick={() => setMode('replace')}>
            <strong>↺ Start a new show</strong>
            <span>Clears the scene, then builds. Undo (⌘Z) brings it back</span>
          </button>
        </div>
      )}
      <textarea
        ref={input}
        rows={3}
        value={text}
        placeholder={EXAMPLES[0]}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
            e.preventDefault()
            void build()
          }
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      <div className="builder-actions">
        <button className={`primary ${mode === 'replace' && !empty ? 'caution' : ''}`} disabled={busy || !text.trim()} onClick={() => void build()}>
          {busy ? 'Building…' : mode === 'replace' && !empty ? 'Clear and build' : empty ? 'Build' : 'Add to show'}
        </button>
        <span className="hint">Enter to build · Shift+Enter for a new line · to talk, press Fn twice (Edit ▸ Start Dictation)</span>
      </div>
      {!log.length && (
        <div className="builder-examples">
          {EXAMPLES.map((e) => (
            <button key={e} className="mini" onClick={() => setText(e)}>
              {e}
            </button>
          ))}
        </div>
      )}
      {window.api && (
        <div className="builder-claude">
          {claude?.connected ? (
            <>
              <span className="hint">Claude is connected (your key is stored encrypted on this Mac).</span>
              <button className="mini" onClick={async () => (await window.api!.clearClaudeKey(), setClaude(await window.api!.claudeStatus()))}>
                Disconnect
              </button>
            </>
          ) : showKey ? (
            <div className="claude-connect">
              <p>
                Claude connects with an <b>API key</b>: a long password that lets this app use Claude on your own Anthropic account. It's separate from a Claude.ai
                subscription (Anthropic doesn't let other apps sign in with that), and you pay only for what you use.
              </p>
              <ol>
                <li>
                  <a className="mini button-link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                    Open the Anthropic Console ↗
                  </a>{' '}
                  and sign in (Google works). New accounts add a little credit under <b>Billing</b> first.
                </li>
                <li>
                  Click <b>Create Key</b>, name it “Sound Visualizer”, and press <b>Copy</b>.
                </li>
                <li>
                  Paste it here:
                  <span className="claude-key-row">
                    <input
                      type="password"
                      autoFocus
                      placeholder="sk-ant-…"
                      value={keyDraft}
                      onChange={(e) => setKeyDraft(e.target.value)}
                      onPaste={(e) => {
                        const pasted = e.clipboardData.getData('text')
                        if (/sk-ant-/.test(pasted)) {
                          e.preventDefault()
                          setKeyDraft(pasted)
                          void saveKey(pasted)
                        }
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && void saveKey()}
                    />
                    <button className="mini primary" disabled={checking || !keyDraft.trim()} onClick={() => void saveKey()}>
                      {checking ? 'Checking…' : 'Connect'}
                    </button>
                  </span>
                </li>
              </ol>
              <p className="soft">
                The key is checked with Anthropic, then stored encrypted in this Mac's keychain. It never leaves this Mac except to talk to Claude. Disconnect any time;
                you can delete the key in the Console too.
              </p>
              <button className="mini quiet" onClick={() => setShowKey(false)}>
                Not now
              </button>
            </div>
          ) : (
            <>
              <span className="hint">Common requests work without Claude. Connect Claude to build anything you can describe.</span>
              <button className="mini" onClick={() => setShowKey(true)}>
                Connect Claude…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
