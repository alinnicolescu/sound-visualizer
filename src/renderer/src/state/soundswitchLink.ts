/** The link to SoundSwitch: what project we follow, and whether to sync automatically. */
import { create } from 'zustand'
import type { SoundSwitchStatus } from '../../../shared/ipc'
import { syncFromSoundSwitch } from './commands'

interface SoundSwitchLink {
  status: SoundSwitchStatus | null
  autoSync: boolean
  receive(status: SoundSwitchStatus): void
  setAutoSync(on: boolean): void
  syncNow(): void
}

export const useSoundSwitch = create<SoundSwitchLink>((set, get) => ({
  status: null,
  autoSync: true,
  receive(status) {
    set({ status })
    if (get().autoSync && status.state === 'linked' && status.fixtures.length > 0) {
      syncFromSoundSwitch(status.fixtures, status.name)
    }
  },
  setAutoSync(autoSync) {
    set({ autoSync })
    if (autoSync) get().syncNow()
  },
  syncNow() {
    const { status } = get()
    if (status?.state === 'linked') syncFromSoundSwitch(status.fixtures, status.name)
  }
}))
