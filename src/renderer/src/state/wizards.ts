/** The New Show wizard and the welcome tour: open or not. */
import { create } from 'zustand'

const SEEN_KEY = 'sound-visualizer:welcome-seen'

export function welcomeSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return true
  }
}

export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Not fatal: the tour shows again next time.
  }
}

interface Wizards {
  newShow: boolean
  welcome: boolean
  openNewShow(): void
  closeNewShow(): void
  openWelcome(): void
  closeWelcome(): void
}

export const useWizards = create<Wizards>((set) => ({
  newShow: false,
  welcome: false,
  openNewShow: () => set({ newShow: true, welcome: false }),
  closeNewShow: () => set({ newShow: false }),
  openWelcome: () => set({ welcome: true, newShow: false }),
  closeWelcome: () => {
    markWelcomeSeen()
    set({ welcome: false })
  }
}))
