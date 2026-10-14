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
