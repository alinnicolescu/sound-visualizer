/**
 * The fixture library: the Open Fixture Library bundled with the app, plus any
 * fixture files you've imported yourself (kept in your user data folder, so an
 * app update never loses them).
 *
 * You can download any fixture from https://open-fixture-library.org as an
 * "Open Fixture Library JSON" file and import it with File ▸ Import Fixture File.
 */
import { dialog, type BrowserWindow } from 'electron'
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { log } from './log'
import { resourcePath, userPath } from './paths'

interface Library {
  source: string
  url: string
  built: string
  manufacturers: Record<string, string>
  fixtures: Record<string, unknown>
}

let cached: Library | null = null

function userLibraryDir(): string {
  return userPath('library', 'x').replace(/x$/, '')
}

/** A file is usable if it looks like an OFL fixture: a name and at least one mode. */
function isFixture(value: unknown): value is { name: string; modes: unknown[]; manufacturerKey?: string } {
  const v = value as { name?: unknown; modes?: unknown }
  return typeof v?.name === 'string' && Array.isArray(v.modes) && v.modes.length > 0
}

export function loadLibrary(force = false): Library {
  if (cached && !force) return cached
  let library: Library = { source: 'Open Fixture Library (MIT)', url: 'https://open-fixture-library.org', built: '', manufacturers: {}, fixtures: {} }
  const bundled = resourcePath('library', 'ofl.json')
  try {
    library = JSON.parse(readFileSync(bundled, 'utf8'))
  } catch (error) {
    log('error', `Couldn't read the fixture library at ${bundled}`, error)
  }
  // Your own fixtures: one OFL JSON file each.
  const dir = userLibraryDir()
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue
      try {
        const fixture = JSON.parse(readFileSync(join(dir, file), 'utf8'))
        if (!isFixture(fixture)) continue
        const man = fixture.manufacturerKey ?? 'imported'
        library.manufacturers[man] ??= man === 'imported' ? 'Imported' : man
        library.fixtures[`${man}/${file.replace(/\.json$/, '')}`] = fixture
      } catch (error) {
        log('warn', `Skipped fixture file ${file}`, error)
      }
    }
  }
  cached = library
  return library
}

/** Ask for OFL fixture files and add them to your library. Returns how many were added. */
export async function importFixtureFiles(window: BrowserWindow | null): Promise<{ added: number; rejected: string[] }> {
  const options = {
    title: 'Import fixture files',
    message: 'Choose Open Fixture Library JSON files (from open-fixture-library.org).',
    filters: [{ name: 'Open Fixture Library JSON', extensions: ['json'] }],
    properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>
  }
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  if (result.canceled) return { added: 0, rejected: [] }
  let added = 0
  const rejected: string[] = []
  for (const path of result.filePaths) {
    try {
      const value = JSON.parse(readFileSync(path, 'utf8'))
      if (!isFixture(value)) throw new Error('not an Open Fixture Library fixture')
      copyFileSync(path, join(userLibraryDir(), basename(path)))
      added++
    } catch (error) {
      rejected.push(`${basename(path)}: ${(error as Error).message}`)
      log('warn', `Rejected fixture file ${path}`, error)
    }
  }
  if (added) loadLibrary(true)
  return { added, rejected }
}
