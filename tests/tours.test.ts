import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TOURS } from '../src/renderer/src/state/tours'

/** Every data-tour="…" marker in the app's source. */
function markers(): Set<string> {
  const found = new Set<string>()
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name)) for (const m of readFileSync(p, 'utf8').matchAll(/data-tour="([\w-]+)"/g)) found.add(m[1])
    }
  }
  walk('src/renderer/src')
  return found
}

describe('guided tours', () => {
  it('point only at things that are marked in the app', () => {
    const marked = markers()
    for (const tour of TOURS) {
      expect(tour.steps.length, tour.id).toBeGreaterThan(2)
      for (const step of tour.steps) if (step.target) expect(marked.has(step.target), `${tour.id}: ${step.target}`).toBe(true)
    }
  })

  it('are all in the Help menu', () => {
    const menu = readFileSync('src/main/menu.ts', 'utf8')
    for (const tour of TOURS) expect(menu.includes(`tour:${tour.id}`), tour.id).toBe(true)
  })
})

describe('view shortcuts', () => {
  it('need Shift: a plain number never moves the camera', async () => {
    const { commandForKey } = await import('../src/renderer/src/state/menuCommands')
    const key = (k: string, code: string, shift: boolean) => ({ key: k, code, shiftKey: shift, metaKey: false, ctrlKey: false, altKey: false }) as KeyboardEvent
    expect(commandForKey(key('1', 'Digit1', false))).toBeNull()
    expect(commandForKey(key('3', 'Digit3', false))).toBeNull()
    expect(commandForKey(key('!', 'Digit1', true))).toBe('viewPerspective')
    expect(commandForKey(key('^', 'Digit6', true))).toBe('viewUp')
  })
})
