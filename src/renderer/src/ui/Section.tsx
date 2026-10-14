/**
 * A titled part of a panel that folds away: click the title to open or close
 * it. Sections start open, and remember being folded on this Mac. A section
 * with nothing in it isn't shown at all.
 */
import { useState, type ReactNode } from 'react'

const KEY = 'sound-visualizer:sections'

function loadFolded(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

let folded = loadFolded()
const listeners = new Set<() => void>()

function setFolded(id: string, fold: boolean) {
  folded = fold ? [...new Set([...folded, id])] : folded.filter((x) => x !== id)
  try {
    localStorage.setItem(KEY, JSON.stringify(folded))
  } catch {
    // Not remembered.
  }
  listeners.forEach((l) => l())
}

export function Section({ id, title, children, extra, hint, className = '', tour }: { id: string; title: string; children: ReactNode; extra?: ReactNode; hint?: string; className?: string; tour?: string }) {
  const [, redraw] = useState(0)
  const closed = folded.includes(id)
  if (children === null || children === undefined || children === false || (Array.isArray(children) && children.every((c) => !c))) return null
  return (
    <fieldset className={`acc ${closed ? 'closed' : ''} ${className}`} data-tour={tour}>
      <legend>
        <button
          className="acc-head"
          aria-expanded={!closed}
          title={`${closed ? 'Show' : 'Fold away'} ${title.toLowerCase()}${hint ? `\n${hint}` : ''}`}
          onClick={() => {
            setFolded(id, !closed)
            redraw((n) => n + 1)
          }}
        >
          <span className="acc-arrow">{closed ? '▸' : '▾'}</span>
          {title}
        </button>
        {extra && !closed && <span className="acc-extra">{extra}</span>}
      </legend>
      {!closed && <div className="acc-body">{children}</div>}
    </fieldset>
  )
}
