/**
 * A small log file, so problems can be looked at after the fact
 * (Help ▸ Open Log Folder). Keeps the last ~2 MB; older lines go to main.old.log.
 */
import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs'
import { userPath } from './paths'

const MAX_BYTES = 2 * 1024 * 1024
let file = ''

function target(): string {
  if (!file) file = userPath('logs', 'main.log')
  try {
    if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, userPath('logs', 'main.old.log'))
  } catch {
    // Rotation is best-effort.
  }
  return file
}

export function log(level: 'info' | 'warn' | 'error', message: string, detail?: unknown): void {
  const extra = detail instanceof Error ? ` ${detail.stack ?? detail.message}` : detail !== undefined ? ` ${JSON.stringify(detail)}` : ''
  const line = `${new Date().toISOString()} [${level}] ${message}${extra}\n`
  if (level === 'error') console.error(line.trim())
  try {
    appendFileSync(target(), line)
  } catch {
    // Logging must never take the app down.
  }
}

export function logFolder(): string {
  return userPath('logs', 'main.log').replace(/main\.log$/, '')
}

/** Record crashes instead of losing them. */
export function catchCrashes(): void {
  process.on('uncaughtException', (error) => log('error', 'Uncaught exception', error))
  process.on('unhandledRejection', (reason) => log('error', 'Unhandled rejection', reason))
}
