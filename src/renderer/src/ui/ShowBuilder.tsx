/**
 * "Describe your show": type (or dictate) what you want, and the rig is built
 * for you, set pieces, fixtures, patch and all, as one undo step.
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
  const input = useRef<HTMLTextAreaElement>(null)

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
    add({ kind: 'you', text: prompt })
    const before = new Set([...useStore.getState().project.fixtures.map((f) => f.id), ...(useStore.getState().project.structures ?? []).map((s) => s.id)])
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
        useStore.getState().select(p.fixtures.filter((f) => fresh.includes(f.id)).map((f) => f.id))
        view.focus(fresh)
      }
      setText('')
    } finally {
      setBusy(false)
    }
  }

  const saveKey = async () => {
    if (!window.api) return
    const r = await window.api.setClaudeKey(keyDraft)
    if (r.error) add({ kind: 'error', text: r.error })
    else {
      setKeyDraft('')
      setShowKey(false)
      add({ kind: 'step', text: 'Claude is connected. Describe any show.' })
    }
    setClaude(await window.api.claudeStatus())
  }

  return (
    <div className="builder" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
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
        <button className="primary" disabled={busy || !text.trim()} onClick={() => void build()}>
          {busy ? 'Building…' : 'Build'}
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
            <>
              <input type="password" placeholder="sk-ant-…" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void saveKey()} />
              <button className="mini" onClick={() => void saveKey()}>
                Save key
              </button>
            </>
          ) : (
            <>
              <span className="hint">Connect Claude to build anything you describe. Needs an Anthropic API key (console.anthropic.com).</span>
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
