import type { VisualizerApi } from '../../shared/ipc'

declare global {
  interface Window {
    /** Present when running inside Electron; missing in a plain browser. */
    api?: VisualizerApi
  }
}
export {}
