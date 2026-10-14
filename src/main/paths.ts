/**
 * Where things live on disk.
 *  - resources: files shipped with the app (the fixture library). In development
 *    they're in the project's resources/ folder; in a packaged app, inside the .app.
 *  - user data: per-user files (logs, your imported fixtures, settings), in
 *    ~/Library/Application Support/Sound Visualizer on a Mac.
 */
import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function resourcePath(...parts: string[]): string {
  const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  return join(base, ...parts)
}

export function userPath(...parts: string[]): string {
  const dir = join(app.getPath('userData'), ...parts.slice(0, -1))
  mkdirSync(dir, { recursive: true })
  return join(app.getPath('userData'), ...parts)
}
