/**
 * Talking to Claude for the show builder. The API key never reaches the page:
 * it's kept here, encrypted with the system keychain (Electron safeStorage),
 * and requests to the Anthropic Messages API are made from this process.
 * The page sends the request body (model, tools, messages) and gets the reply.
 */
import { app, net, safeStorage } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './log'

const keyFile = () => join(app.getPath('userData'), 'claude-key.bin')

function readKey(): string | null {
  try {
    if (!existsSync(keyFile())) return null
    return safeStorage.decryptString(readFileSync(keyFile()))
  } catch (error) {
    log('warn', 'Could not read the saved Claude key', error)
    return null
  }
}

export function claudeStatus(): { connected: boolean; encryption: boolean } {
  return { connected: !!readKey(), encryption: safeStorage.isEncryptionAvailable() }
}

export function setClaudeKey(key: string): { connected: boolean; error?: string } {
  const trimmed = key.trim()
  if (!/^sk-ant-[\w-]{20,}$/.test(trimmed)) return { connected: false, error: "That doesn't look like an Anthropic API key (it starts with sk-ant-)." }
  if (!safeStorage.isEncryptionAvailable()) return { connected: false, error: "This computer's keychain isn't available, so the key can't be stored safely." }
  writeFileSync(keyFile(), safeStorage.encryptString(trimmed))
  log('info', 'Claude key saved')
  return { connected: true }
}

export function clearClaudeKey(): void {
  if (existsSync(keyFile())) unlinkSync(keyFile())
}

/** One Messages API call. Throws with Anthropic's error message when it fails. */
export async function claudeRequest(body: unknown): Promise<unknown> {
  const key = readKey()
  if (!key) throw new Error('Claude is not connected: add your API key first.')
  const response = await net.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body)
  })
  const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
  if (!response.ok) {
    const message = json?.error?.message ?? `HTTP ${response.status}`
    log('warn', 'Claude request failed', message)
    throw new Error(response.status === 401 ? 'Claude rejected the API key. Check it in the builder settings.' : message)
  }
  return json
}
