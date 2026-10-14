/**
 * Project files (.ssvis) and saved images.
 *
 * A project file is JSON: { format, version, savedAt, project }. Writes go to a
 * temporary file first and are then renamed over the old one, so a crash
 * mid-save can't leave you with half a file.
 */
import { app, dialog, type BrowserWindow } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { log } from './log'

export const PROJECT_EXTENSION = 'ssvis'
const FORMAT = 'sound-visualizer'
/** Files saved before the app was renamed. */
const OLD_FORMAT = 'soundswitch-visualizer'

function writeSafely(path: string, data: string | Buffer): void {
  const temp = `${path}.saving`
  writeFileSync(temp, data)
  renameSync(temp, path)
}

export async function saveProject(window: BrowserWindow | null, projectJson: string, path: string | null, saveAs: boolean, name: string): Promise<string | null> {
  let target = path
  if (!target || saveAs) {
    const options = {
      title: 'Save project',
      defaultPath: `${name.replace(/[/\\:]/g, '-') || 'Untitled'}.${PROJECT_EXTENSION}`,
      filters: [{ name: 'Sound Visualizer project', extensions: [PROJECT_EXTENSION] }]
    }
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    target = result.filePath
  }
  const file = JSON.stringify({ format: FORMAT, version: 1, savedAt: new Date().toISOString(), project: JSON.parse(projectJson) }, null, 1)
  writeSafely(target, file)
  app.addRecentDocument(target)
  log('info', `Saved ${target}`)
  return target
}

export interface OpenedProject {
  path: string
  project: unknown
}

export function readProject(path: string): OpenedProject {
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if ((parsed?.format !== FORMAT && parsed?.format !== OLD_FORMAT) || !parsed.project?.fixtures) throw new Error(`${basename(path)} isn't a Sound Visualizer project.`)
  app.addRecentDocument(path)
  return { path, project: parsed.project }
}

export async function openProject(window: BrowserWindow | null): Promise<OpenedProject | null> {
  const options = {
    title: 'Open project',
    filters: [{ name: 'Sound Visualizer project', extensions: [PROJECT_EXTENSION] }],
    properties: ['openFile'] as Array<'openFile'>
  }
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths[0]) return null
  return readProject(result.filePaths[0])
}

/** Save a PNG of the 3D view. `dataUrl` comes from the canvas. */
export async function saveImage(window: BrowserWindow | null, dataUrl: string, name: string): Promise<string | null> {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  const options = {
    title: 'Save view as image',
    defaultPath: `${app.getPath('pictures')}/${name.replace(/[/\\:]/g, '-') || 'View'}.png`,
    filters: [{ name: 'PNG image', extensions: ['png'] }]
  }
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  writeSafely(result.filePath, Buffer.from(match[1], 'base64'))
  return result.filePath
}

/** Save any file the page made (an MVR, a CSV patch list). */
export async function saveFile(window: BrowserWindow | null, defaultName: string, filters: Array<{ name: string; extensions: string[] }>, data: string | Uint8Array): Promise<string | null> {
  const options = { title: 'Export', defaultPath: `${app.getPath('documents')}/${defaultName.replace(/[/\\:]/g, '-')}`, filters }
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  writeSafely(result.filePath, typeof data === 'string' ? data : Buffer.from(data))
  log('info', `Exported ${result.filePath}`)
  return result.filePath
}

/** Pick a file for the page to read (a show to merge, an MVR). */
export async function openFile(window: BrowserWindow | null, filters: Array<{ name: string; extensions: string[] }>): Promise<{ path: string; name: string; bytes: Uint8Array } | null> {
  const options = { title: 'Import', filters, properties: ['openFile'] as Array<'openFile'> }
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths[0]) return null
  const path = result.filePaths[0]
  return { path, name: basename(path), bytes: new Uint8Array(readFileSync(path)) }
}
