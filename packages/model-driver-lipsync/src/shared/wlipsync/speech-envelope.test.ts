import { describe, expect, it } from 'vitest'

import { SpeechEnvelope } from './speech-envelope'

/** The node volume of a log10 RMS, in the range that `configure` sets. */
function nodeVolume(logRms: number) {
  return (logRms + 3) / 3
}

describe('speechEnvelope', () => {
  it('sets a wide volume range on the node', () => {
    const node = { minVolume: -2.5, maxVolume: -1.5, volume: 0 }

    new SpeechEnvelope().configure(node)

    expect(node).toEqual({ minVolume: -3, maxVolume: 0, volume: 0 })
  })

  it('gives 1 at the peak of the voice and 0 in a gap 10 dB under it', () => {
    const envelope = new SpeechEnvelope()

    expect(envelope.update(nodeVolume(-1), 0.016)).toBeCloseTo(1)
    expect(envelope.update(nodeVolume(-1.25), 0.016)).toBeCloseTo(0.5, 1)
    expect(envelope.update(nodeVolume(-1.5), 0.016)).toBeCloseTo(0, 1)
  })

  it('follows a quieter voice after the peak falls', () => {
    const envelope = new SpeechEnvelope()
    envelope.update(nodeVolume(-0.8), 0.016)

    for (let frame = 0; frame < 240; frame++)
      envelope.update(nodeVolume(-1.4), 1 / 60)

    expect(envelope.update(nodeVolume(-1.4), 1 / 60)).toBeCloseTo(1)
  })

  it('keeps the mouth closed for room noise', () => {
    const envelope = new SpeechEnvelope()

    expect(envelope.update(nodeVolume(-2.6), 1)).toBe(0)
  })
})
