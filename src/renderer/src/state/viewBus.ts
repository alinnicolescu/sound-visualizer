/**
 * Requests for the 3D view that don't belong in the project: "show the top
 * view", "frame the selection", "take a picture". The Viewport registers the
 * handlers; buttons, menus and keys call these.
 */
export type ViewPreset = 'perspective' | 'top' | 'front' | 'left' | 'right' | 'up'

export interface ViewHandlers {
  preset(view: ViewPreset): void
  focus(ids: string[] | 'all'): void
  goTo(position: [number, number, number], target: [number, number, number]): void
  current(): { position: [number, number, number]; target: [number, number, number] }
  /** A PNG of the view as a data URL. */
  capture(): string
}

let handlers: ViewHandlers | null = null

export function registerView(h: ViewHandlers | null): void {
  handlers = h
}

export const view = {
  preset: (v: ViewPreset) => handlers?.preset(v),
  focus: (ids: string[] | 'all') => handlers?.focus(ids),
  goTo: (p: [number, number, number], t: [number, number, number]) => handlers?.goTo(p, t),
  current: () => handlers?.current() ?? null,
  capture: () => handlers?.capture() ?? null
}
