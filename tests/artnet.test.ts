import { describe, expect, it } from 'vitest'
import { buildArtDmx, parseArtDmx } from '../src/shared/artnet'

describe('Art-Net', () => {
  it('round-trips an ArtDmx packet', () => {
    const data = new Uint8Array(512)
    data[0] = 255
    data[511] = 7
    const parsed = parseArtDmx(buildArtDmx(0x0123, data, 9))
    expect(parsed).not.toBeNull()
    expect(parsed!.universe).toBe(0x0123)
    expect(parsed!.sequence).toBe(9)
    expect(parsed!.data[0]).toBe(255)
    expect(parsed!.data[511]).toBe(7)
  })

  it('pads short packets to 512 channels', () => {
    const parsed = parseArtDmx(buildArtDmx(1, new Uint8Array([10, 20, 30])))
    expect(parsed!.data.length).toBe(512)
    expect(Array.from(parsed!.data.subarray(0, 4))).toEqual([10, 20, 30, 0])
  })

  it('ignores packets that are not ArtDmx', () => {
    const packet = buildArtDmx(0, new Uint8Array(512))
    packet[9] = 0x20 // ArtPoll opcode
    expect(parseArtDmx(packet)).toBeNull()
    expect(parseArtDmx(new Uint8Array([1, 2, 3]))).toBeNull()
  })
})

import { buildArtPollReply, isArtPoll } from '../src/shared/artnet'

describe('Art-Net discovery', () => {
  it('recognises an ArtPoll', () => {
    const poll = new Uint8Array(14)
    poll.set([0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00, 0x00, 0x20, 0x00, 0x0e])
    expect(isArtPoll(poll)).toBe(true)
    expect(isArtPoll(buildArtDmx(0, new Uint8Array(512)))).toBe(false)
  })

  it('builds a 239-byte reply with our address and name', () => {
    const reply = buildArtPollReply({ ip: [192, 168, 1, 20], shortName: 'Visualizer', longName: 'Lighting Visualizer' })
    expect(reply.length).toBe(239)
    expect(reply[8] | (reply[9] << 8)).toBe(0x2100)
    expect(Array.from(reply.subarray(10, 14))).toEqual([192, 168, 1, 20])
    expect(new TextDecoder().decode(reply.subarray(26, 36))).toBe('Visualizer')
    expect(reply[173]).toBe(4)
  })
})
