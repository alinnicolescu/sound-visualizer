/**
 * Security for a shared, installed app (Electron's security checklist):
 *
 *  - The page runs sandboxed with context isolation and no Node.js; the preload
 *    script exposes only the small typed API in shared/ipc.ts.
 *  - IPC messages are only accepted from our own page (not from anything else
 *    that could end up in a frame).
 *  - The window can't navigate away, open new windows, or attach <webview>s;
 *    links open in the browser, and only https ones.
 *  - Every permission request (camera, microphone, location, notifications…) is
 *    refused: the app needs none of them.
 *  - A Content-Security-Policy on the page only allows its own scripts
 *    (electron.vite.config.ts adds it to the built page).
 *  - The packaged app has Electron's "fuses" set so it can't be run as plain
 *    Node.js or have code injected through command-line flags or environment
 *    variables, and its app.asar is checked against tampering
 *    (electron-builder.yml).
 *  - The Claude API key is stored encrypted by the system keychain and never
 *    reaches the page (claude.ts).
 */
import { app, ipcMain, session, shell, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { pathToFileURL } from 'node:url'
import { log } from './log'

let rendererRoot = ''

/** Where our page is loaded from: the built file, or the dev server. */
export function setRendererOrigin(fileOrUrl: string): void {
  rendererRoot = /^https?:/.test(fileOrUrl) ? new URL(fileOrUrl).origin : pathToFileURL(fileOrUrl).href.replace(/[^/]*$/, '')
}

function trusted(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  const ok = !!rendererRoot && url.startsWith(rendererRoot)
  if (!ok) log('warn', 'Ignored a message from an unexpected page', url)
  return ok
}

/** ipcMain.handle, for our page only. */
export function handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: never[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('Not allowed')
    return (listener as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown)(event, ...args)
  })
}

/** ipcMain.on, for our page only. */
export function listen(channel: string, listener: (event: IpcMainEvent, ...args: never[]) => void): void {
  ipcMain.on(channel, (event, ...args) => {
    if (!trusted(event)) return
    ;(listener as (e: IpcMainEvent, ...a: unknown[]) => void)(event, ...args)
  })
}

/** Lock down every web page the app creates. Call once, before the first window. */
export function hardenApp(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    log('info', `Refused a permission request: ${permission}`)
    callback(false)
  })
  session.defaultSession.setPermissionCheckHandler(() => false)

  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.on('will-navigate', (event, url) => {
      if (rendererRoot && url.startsWith(rendererRoot)) return
      event.preventDefault()
      if (/^https:\/\//.test(url)) void shell.openExternal(url)
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })
}
