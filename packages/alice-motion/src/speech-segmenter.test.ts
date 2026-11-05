import { describe, expect, it } from 'vitest'

import { rootMeanSquare, SpeechSegmenter } from './speech-segmenter'

const sampleRate = 16000
/** 32 ms chunks, like an audio worklet with 512 samples. */
const chunkSize = 512

function chunks(level: number, ms: number) {
  const count = Math.round(ms * sampleRate / 1000 / chunkSize)
  return Array.from({ length: count }, () => new Float32Array(chunkSize).fill(level))
}

function feed(segmenter: SpeechSegmenter, parts: Float32Array[][]) {
  const segments = []
  for (const part of parts) {
    for (const chunk of part) {
      const segment = segmenter.push(chunk)
      if (segment)
        segments.push(segment)
    }
  }
  return segments
}

describe('speechSegmenter', () => {
  it('returns one segment for a phrase between silences, with the pre-roll and a short tail', () => {
    const segmenter = new SpeechSegmenter({ sampleRate })
    const segments = feed(segmenter, [chunks(0, 1000), chunks(0.2, 1500), chunks(0, 1300)])

    expect(segments).toHaveLength(1)
    // 1500 ms of speech, about 300 ms of pre-roll and 300 ms of tail.
    expect(segments[0].durationMs).toBeGreaterThan(1900)
    expect(segments[0].durationMs).toBeLessThan(2300)
    expect(segments[0].sampleRate).toBe(sampleRate)
    expect(segmenter.inSpeech).toBe(false)
  })

  it('drops a click that is shorter than the minimum speech', () => {
    const segmenter = new SpeechSegmenter({ sampleRate })
    expect(feed(segmenter, [chunks(0, 500), chunks(0.3, 200), chunks(0, 1500)])).toEqual([])
  })

  it('keeps a phrase open through a short pause', () => {
    const segmenter = new SpeechSegmenter({ sampleRate })
    const segments = feed(segmenter, [chunks(0.2, 800), chunks(0, 600), chunks(0.2, 800), chunks(0, 1300)])

    expect(segments).toHaveLength(1)
    expect(segments[0].durationMs).toBeGreaterThan(2200)
  })

  it('ends a long phrase at the maximum length', () => {
    const segmenter = new SpeechSegmenter({ sampleRate, maxSpeechMs: 3000 })
    const segments = feed(segmenter, [chunks(0.2, 7000)])

    expect(segments.length).toBeGreaterThanOrEqual(2)
    expect(segments[0].durationMs).toBeLessThanOrEqual(3100)
  })

  it('forgets the open phrase on reset', () => {
    const segmenter = new SpeechSegmenter({ sampleRate })
    feed(segmenter, [chunks(0.2, 800)])
    expect(segmenter.inSpeech).toBe(true)
    segmenter.reset()
    expect(segmenter.inSpeech).toBe(false)
    expect(feed(segmenter, [chunks(0, 1500)])).toEqual([])
  })

  it('measures the level as root mean square', () => {
    expect(rootMeanSquare(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5)
    expect(rootMeanSquare(new Float32Array())).toBe(0)
  })
})
