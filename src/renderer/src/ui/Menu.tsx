/**
 * The pieces every right-click menu is made of. The menu floats over the whole
 * window (not just the panel it opened in), never runs off the edge (it opens
 * upwards or leftwards when it has to), and scrolls when it's taller than the
 * window. Submenus fly out to the side on hover, like the Mac's own menus.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const EDGE = 8

/** Where a box of this size can go near (x, y) and stay on screen. */
function fit(x: number, y: number, w: number, h: number, flipFrom?: number): { left: number; top: number } {
  const W = window.innerWidth
  const H = window.innerHeight
  let left = x
  // No room on the right: open to the left of the point (or of the parent menu).
  if (left + w > W - EDGE) left = Math.max(EDGE, (flipFrom ?? x) - w)
  let top = y
  if (top + h > H - EDGE) top = Math.max(EDGE, H - EDGE - h)
  return { left, top }
}

export function MenuShell({ at, onClose, children }: { at: { x: number; y: number }; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setPos(fit(at.x, at.y, el.offsetWidth, Math.min(el.scrollHeight, window.innerHeight - 2 * EDGE)))
  }, [at.x, at.y])
  return createPortal(
    <>
      <div className="menu-backdrop fixed" onPointerDown={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div
        ref={ref}
        className="fixture-menu floating"
        role="menu"
        style={{ left: pos?.left ?? at.x, top: pos?.top ?? at.y, visibility: pos ? 'visible' : 'hidden' }}
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
      </div>
    </>,
    document.body
  )
}

export function MenuItem({ label, onClick, check, keys, danger, disabled, title }: { label: string; onClick: () => void; check?: string; keys?: string; danger?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button className={`menu-item ${danger ? 'danger' : ''}`} onClick={onClick} disabled={disabled} title={title} role="menuitem">
      <span className="menu-check">{check}</span>
      <span className="menu-label">{label}</span>
      {keys && <span className="menu-keys">{keys}</span>}
    </button>
  )
}

/** An item that opens a submenu beside it on hover (or click). */
export function SubMenu({ label, children, disabled }: { label: string; children: ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const item = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!open || !item.current || !panel.current) return setPos(null)
    const r = item.current.getBoundingClientRect()
    setPos(fit(r.right - 2, r.top - 5, panel.current.offsetWidth, Math.min(panel.current.scrollHeight, window.innerHeight - 2 * EDGE), r.left + 2))
  }, [open])
  const show = () => {
    window.clearTimeout(timer.current)
    if (!disabled) setOpen(true)
  }
  const hide = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(false), 180)
  }
  return (
    <div className="submenu" onMouseEnter={show} onMouseLeave={hide}>
      <button ref={item} className={`menu-item ${open ? 'open' : ''}`} disabled={disabled} onClick={() => setOpen(!open)} role="menuitem" aria-haspopup="menu" aria-expanded={open}>
        <span className="menu-check" />
        <span className="menu-label">{label}</span>
        <span className="menu-keys">▸</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            className="fixture-menu floating sub"
            role="menu"
            style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
            onMouseEnter={show}
            onMouseLeave={hide}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  )
}
