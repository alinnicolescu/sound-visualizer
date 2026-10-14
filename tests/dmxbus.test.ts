import { describe, expect, it } from 'vitest'
import { dmxBus } from '../src/renderer/src/state/dmxBus'

describe('mixing the show with the faders', () => {
  it("lets the show's pan and tilt through, below the heads-down level too", () => {
    dmxBus.clearFaders()
    // The app points heads down on its own (128)...
    dmxBus.setFader(0, 1, 128, false)
    dmxBus.setFader(0, 2, 128, false)
    // ...then SoundSwitch tilts them forward with low values.
    const show = new Uint8Array(512)
    show[0] = 40
    show[1] = 20
    dmxBus.receiveArtNet(0, show)
    const out = dmxBus.levels(0)
    expect([out[0], out[1]]).toEqual([40, 20])
  })

  it('a fader moved by hand overrides that channel until released', () => {
    dmxBus.setFader(0, 2, 200)
    expect(dmxBus.levels(0)[1]).toBe(200)
    expect(dmxBus.levels(0)[0]).toBe(40)
    dmxBus.clearFaders()
    expect(dmxBus.levels(0)[1]).toBe(20)
  })
})
