/**
 * Tooltips for the whole app. Any element with a `title` gets a quick, readable
 * tooltip (the built-in one takes a second or more and is easy to miss). The
 * title is moved aside while the tooltip shows, so the two never double up,
 * and put back afterwards. Multi-line titles keep their lines.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const DELAY = 380
const EDGE = 8

export function Tooltips() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    let target: HTMLElement | null = null
    let timer = 0
    const restore = () => {
      if (target?.dataset.tipTitle !== undefined) {
        // React may have set a new title meanwhile; keep the newest.
        if (!target.getAttribute('title')) target.setAttribute('title', target.dataset.tipTitle)
        delete target.dataset.tipTitle
      }
    }
    const hide = () => {
      window.clearTimeout(timer)
      restore()
      target = null
      setTip(null)
    }
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const el = (e.target as Element | null)?.closest?.('[title]') as HTMLElement | null
      if (el === target) return
      hide()
      if (!el) return
      const text = el.getAttribute('title')?.trim()
      if (!text) return
      target = el
      timer = window.setTimeout(() => {
        if (target !== el || !el.isConnected) return
        // Hide the built-in tooltip while ours shows.
        el.dataset.tipTitle = el.getAttribute('title') ?? ''
        el.removeAttribute('title')
        const r = el.getBoundingClientRect()
        const below = r.bottom + 60 < window.innerHeight
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below })
      }, DELAY)
    }
    const onOut = (e: PointerEvent) => {
      if (!target) return
      const to = e.relatedTarget as Node | null
      if (to && target.contains(to)) return
      hide()
    }
    document.addEventListener('pointerover', onOver, true)
    document.addEventListener('pointerout', onOut, true)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', hide, true)
    document.addEventListener('wheel', hide, { capture: true, passive: true })
    window.addEventListener('blur', hide)
    return () => {
      hide()
      document.removeEventListener('pointerover', onOver, true)
      document.removeEventListener('pointerout', onOut, true)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', hide, true)
      document.removeEventListener('wheel', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!tip || !el) return setPos(null)
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = Math.max(EDGE, Math.min(window.innerWidth - w - EDGE, tip.x - w / 2))
    const top = tip.below ? Math.min(window.innerHeight - h - EDGE, tip.y) : Math.max(EDGE, tip.y - h)
    setPos({ left, top })
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div ref={ref} className="tooltip" role="tooltip" style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0 }}>
      {tip.text}
    </div>,
    document.body
  )
}
