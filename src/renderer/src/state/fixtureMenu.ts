/** The right-click menu on fixtures in the 3D view: open or not, and where. */
import { create } from 'zustand'

interface FixtureMenuState {
  at: { x: number; y: number } | null
  open(x: number, y: number): void
  close(): void
}

export const useFixtureMenu = create<FixtureMenuState>((set) => ({
  at: null,
  open: (x, y) => set({ at: { x, y } }),
  close: () => set({ at: null })
}))
