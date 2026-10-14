import { describe, expect, it } from 'vitest'
import { clampWidths, PANEL_MIN } from '../src/renderer/src/ui/PanelResizer'

describe('panel widths', () => {
  it('never go below the minimum, and always leave the 3D view room', () => {
    expect(clampWidths({ left: 50, right: 50 }, 1440)).toEqual({ left: PANEL_MIN.left, right: PANEL_MIN.right })
    const wide = clampWidths({ left: 900, right: 900 }, 1440)
    expect(1440 - wide.left - wide.right).toBeGreaterThanOrEqual(420)
    expect(clampWidths({ left: 400, right: 320 }, 1600)).toEqual({ left: 400, right: 320 })
  })
})
