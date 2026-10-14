/**
 * Drag the edge of the left or right panel to make it wider or narrower.
 * Widths stay between a minimum (so nothing is cut off) and a share of the
 * window (so the 3D view keeps room), are remembered on this Mac, and a
 * double-click on the edge puts the default back. Arrow keys work when the
 * edge has focus.
 */
import { useCallback, useEffect, useState } from 'react'

const KEY = 'sound-visualizer:panel-widths'
export const PANEL_DEFAULTS = { left: 320, right: 300 }
export const PANEL_MIN = { left: 260, right: 260 }
const CENTER_MIN = 420

type Side = 'left' | 'right'
type Widths = Record<Side, number>

function load(): Widths {
  try {
    return { ...PANEL_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { ...PANEL_DEFAULTS }
  }
}

/** Keep each panel between its minimum and what leaves the 3D view enough room. */
export function clampWidths(w: Widths, windowWidth: number): Widths {
  const room = Math.max(0, windowWidth - CENTER_MIN)
  const left = Math.max(PANEL_MIN.left, Math.min(w.left, Math.max(PANEL_MIN.left, room - PANEL_MIN.right), 640))
  const right = Math.max(PANEL_MIN.right, Math.min(w.right, Math.max(PANEL_MIN.right, room - left), 560))
  return { left: Math.round(left), right: Math.round(right) }
}

export function usePanelWidths(): [Widths, (side: Side, width: number) => void, (side: Side) => void] {
  const [widths, setWidths] = useState<Widths>(() => clampWidths(load(), window.innerWidth))
  const save = (w: Widths) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(w))
    } catch {
      // Not remembered.
    }
  }
  const set = useCallback((side: Side, width: number) => {
    setWidths((w) => {
      const next = clampWidths({ ...w, [side]: width }, window.innerWidth)
      save(next)
      return next
    })
  }, [])
  const reset = useCallback((side: Side) => set(side, PANEL_DEFAULTS[side]), [set])
  // A smaller window squeezes the panels back within their limits.
  useEffect(() => {
    const onResize = () => setWidths((w) => clampWidths(w, window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return [widths, set, reset]
}

export function PanelResizer({ side, width, onChange, onReset }: { side: Side; width: number; onChange: (w: number) => void; onReset: () => void }) {
  const [dragging, setDragging] = useState(false)
  return (
    <div
      className={`panel-resizer ${side} ${dragging ? 'dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Width of the ${side} panel`}
      aria-valuenow={width}
      tabIndex={0}
      title={`Drag to make the ${side} panel wider or narrower. Double-click for the usual width.`}
      onPointerDown={(e) => {
        e.preventDefault()
        const startX = e.clientX
        const startW = width
        setDragging(true)
        const move = (ev: PointerEvent) => onChange(startW + (side === 'left' ? ev.clientX - startX : startX - ev.clientX))
        const up = () => {
          setDragging(false)
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          document.body.classList.remove('resizing')
        }
        document.body.classList.add('resizing')
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10
        if (e.key === 'ArrowLeft') (e.preventDefault(), onChange(width + (side === 'left' ? -step : step)))
        if (e.key === 'ArrowRight') (e.preventDefault(), onChange(width + (side === 'left' ? step : -step)))
      }}
    />
  )
}
