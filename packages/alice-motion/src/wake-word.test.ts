import { describe, expect, it } from 'vitest'

import { neoAliceWakeEvent } from './neoalice-satellite'
import { matchWakeWord, normalizeSpeech, parseWakeWords } from './wake-word'

describe('wake word', () => {
  const words = parseWakeWords('Eva, Éva')

  it('normalizes accents, case, and punctuation', () => {
    expect(normalizeSpeech('  Évá!  Que horas são? ')).toBe('eva que horas sao')
    expect(words).toEqual(['eva', 'eva'])
  })

  it('wakes on a phrase that starts with the wake word, and keeps the question', () => {
    expect(matchWakeWord('Eva, que horas são?', words)).toEqual({ word: 'eva', rest: 'que horas são?' })
    expect(matchWakeWord('Oi Eva, liga a luz', words)).toEqual({ word: 'eva', rest: 'liga a luz' })
    expect(matchWakeWord('Eva.', words)).toEqual({ word: 'eva', rest: '' })
  })

  it('does not wake on a phrase that only talks about Eva', () => {
    expect(matchWakeWord('eu gosto da Eva', words)).toBeUndefined()
    expect(matchWakeWord('que horas são', words)).toBeUndefined()
    expect(matchWakeWord('', words)).toBeUndefined()
  })

  it('matches a wake word of two words', () => {
    expect(matchWakeWord('Ok Alice, toca música', parseWakeWords('ok alice'))).toEqual({ word: 'ok alice', rest: 'toca música' })
  })

  it('builds the evt/wake message of the NeoAlice satellites', () => {
    const message = neoAliceWakeEvent({ site: 'airi-avatar', userId: '', sessionId: 's1', word: 'eva', confidence: 1, nowMs: 0 })

    expect(message.topic).toBe('neoalice/v1/airi-avatar/evt/wake')
    expect(message.qos).toBe(1)
    expect(JSON.parse(message.payload)).toEqual({ v: 1, type: 'evt.wake', ts: '1970-01-01T00:00:00.000Z', site_id: 'airi-avatar', session_id: 's1', wake: { word: 'eva', confidence: 1 } })
  })
})
