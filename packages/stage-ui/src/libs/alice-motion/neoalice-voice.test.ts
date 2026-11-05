import { describe, expect, it } from 'vitest'

import { segmentToWavBase64 } from './neoalice-voice'

describe('segmentToWavBase64', () => {
  it('encodes the samples as a 16 bit mono WAV file', () => {
    const base64 = segmentToWavBase64({ samples: new Float32Array(160), sampleRate: 16000, durationMs: 10 })
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0))

    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('RIFF')
    expect(bytes.length).toBe(44 + 160 * 2)
  })
})
