/**
 * The fixture library in the page: loaded once from the main process, searched
 * here. Converting a fixture to one of our types only happens when you pick it.
 */
import { create } from 'zustand'
import { fixtureTypeFromOfl, libraryIndex, type LibraryEntry, type OflLibrary } from '../model/oflImport'
import type { FixtureType } from '../model/fixtureTypes'
import { notify } from './notices'

const RECENT_KEY = 'soundswitch-visualizer:library-recent'
const RECENT_MAX = 12

/** The library browser's categories, built from OFL's categories. */
export const CATEGORIES: Array<{ id: string; label: string; match: (c: string[]) => boolean }> = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'moving', label: 'Moving heads', match: (c) => c.includes('Moving Head') || c.includes('Scanner') || c.includes('Barrel Scanner') },
  { id: 'wash', label: 'Pars & washes', match: (c) => (c.includes('Color Changer') || c.includes('Dimmer')) && !c.includes('Moving Head') && !c.includes('Pixel Bar') },
  { id: 'pixel', label: 'Bars & pixels', match: (c) => c.includes('Pixel Bar') || c.includes('Matrix') },
  { id: 'strobe', label: 'Strobes & blinders', match: (c) => c.includes('Strobe') || c.includes('Blinder') },
  { id: 'effect', label: 'Effects & lasers', match: (c) => c.includes('Effect') || c.includes('Flower') || c.includes('Laser') },
  { id: 'atmos', label: 'Smoke & haze', match: (c) => c.includes('Smoke') || c.includes('Hazer') || c.includes('Fan') }
]

interface LibraryState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
  library: OflLibrary | null
  entries: LibraryEntry[]
  recent: string[]
  load(force?: boolean): Promise<void>
  /** Our fixture type for a library fixture and mode. Remembers it as recently used. */
  typeFor(key: string, modeIndex: number): FixtureType | null
  importFiles(): Promise<void>
}

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

export const useLibrary = create<LibraryState>((set, get) => ({
  status: 'idle',
  library: null,
  entries: [],
  recent: loadRecent(),

  async load(force = false) {
    if (!force && (get().status === 'loading' || get().status === 'ready')) return
    set({ status: 'loading' })
    try {
      // In the app the main process reads it from disk; in a plain browser (previews, tests) it's fetched.
      const library = (window.api ? await window.api.loadLibrary() : await (await fetch('library/ofl.json')).json()) as OflLibrary
      set({ library, entries: libraryIndex(library), status: 'ready', error: undefined })
    } catch (error) {
      set({ status: 'error', error: (error as Error).message })
      window.api?.log('error', 'Library failed to load', String(error))
    }
  },

  typeFor(key, modeIndex) {
    const { library, entries } = get()
    const fixture = library?.fixtures[key]
    const entry = entries.find((e) => e.key === key)
    if (!fixture || !entry) return null
    const recent = [key, ...get().recent.filter((k) => k !== key)].slice(0, RECENT_MAX)
    set({ recent })
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
    } catch {
      // Recent items are a convenience only.
    }
    return fixtureTypeFromOfl(key, entry.manufacturer, fixture, modeIndex)
  },

  async importFiles() {
    if (!window.api) return
    const { added, rejected } = await window.api.importFixtureFiles()
    if (added) {
      await get().load(true)
      notify('info', `Imported ${added} fixture file${added === 1 ? '' : 's'} into the library (under "Imported").`)
    }
    for (const r of rejected) notify('error', `Not imported: ${r}`)
  }
}))

/** Search: every word must appear in the manufacturer, name or categories. */
export function searchLibrary(entries: LibraryEntry[], query: string, category: string): LibraryEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const cat = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0]
  return entries.filter((e) => {
    if (!cat.match(e.categories)) return false
    const text = `${e.manufacturer} ${e.name} ${e.categories.join(' ')} ${e.bulb ?? ''}`.toLowerCase()
    return words.every((w) => text.includes(w))
  })
}
