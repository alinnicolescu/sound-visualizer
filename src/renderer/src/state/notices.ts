/** Short messages shown at the bottom of the 3D view ("Saved show.ssvis", errors). */
import { create } from 'zustand'

export interface NoticeItem {
  id: number
  kind: 'info' | 'error'
  text: string
}

interface NoticeState {
  items: NoticeItem[]
  push(kind: NoticeItem['kind'], text: string): void
  dismiss(id: number): void
}

let next = 1

export const useNotices = create<NoticeState>((set, get) => ({
  items: [],
  push(kind, text) {
    const id = next++
    set({ items: [...get().items.slice(-3), { id, kind, text }] })
    setTimeout(() => get().dismiss(id), kind === 'error' ? 8000 : 3500)
  },
  dismiss(id) {
    set({ items: get().items.filter((n) => n.id !== id) })
  }
}))

export function notify(kind: NoticeItem['kind'], text: string): void {
  useNotices.getState().push(kind, text)
}
