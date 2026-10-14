/**
 * The dialogs that guide people: the New Show wizard, the welcome tour, the
 * list of guided tours, "welcome back" after a reinstall, and starting fresh.
 *
 * First run (nothing remembered on this Mac): an empty show, the welcome tour,
 * then the New Show wizard, then a short tour of the screen. See onboarding.ts.
 */
import { create } from 'zustand'
import { useTour } from './tours'

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

export interface InstallInfo {
  changed: boolean
  firstEver: boolean
  version: string
  previousVersion: string | null
}

interface Wizards {
  newShow: boolean
  welcome: boolean
  /** Setting up for the first time: the welcome leads into New Show, then a tour. */
  firstRun: boolean
  toursList: boolean
  /** The app was reinstalled or updated on a Mac that used it before. */
  welcomeBack: InstallInfo | null
  /** The "start fresh?" confirmation is open. */
  freshStart: boolean
  openNewShow(): void
  /** `created`: a show was made (true), or the tour to show next ('build' after describing). */
  closeNewShow(created?: boolean | string): void
  openWelcome(): void
  closeWelcome(): void
  startFirstRun(): void
  setToursList(open: boolean): void
  openWelcomeBack(info: InstallInfo): void
  closeWelcomeBack(): void
  askFreshStart(): void
  closeFreshStart(): void
}

export const useWizards = create<Wizards>((set, get) => ({
  newShow: false,
  welcome: false,
  firstRun: false,
  toursList: false,
  welcomeBack: null,
  freshStart: false,
  openNewShow: () => set({ newShow: true, welcome: false }),
  closeNewShow: (created = false) => {
    const first = get().firstRun
    set({ newShow: false, firstRun: false })
    // The first show is made: show where everything is (after the wizard has gone).
    if (first && created) setTimeout(() => useTour.getState().start(typeof created === 'string' ? created : 'basics'), 600)
  },
  openWelcome: () => set({ welcome: true, newShow: false }),
  closeWelcome: () => {
    markWelcomeSeen()
    // First time: whichever way the welcome closes, the next step is making a show.
    set({ welcome: false, newShow: get().firstRun })
  },
  startFirstRun: () => set({ firstRun: true, welcome: true, newShow: false, welcomeBack: null, freshStart: false }),
  setToursList: (toursList) => set({ toursList }),
  openWelcomeBack: (welcomeBack) => set({ welcomeBack }),
  closeWelcomeBack: () => set({ welcomeBack: null }),
  askFreshStart: () => set({ freshStart: true, welcomeBack: null }),
  closeFreshStart: () => set({ freshStart: false })
}))
