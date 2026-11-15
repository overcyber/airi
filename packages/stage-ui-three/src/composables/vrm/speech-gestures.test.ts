import { parseCustomMotion } from '@proj-airi/alice-motion'
import { describe, expect, it } from 'vitest'

import { beatKinds, buildBeat } from './speech-gesture-beats'
import { rolesOfClause, SpeechGestureChoreographer } from './speech-gestures'

function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function collect(text: string, seed: number, seconds = 40) {
  const choreographer = new SpeechGestureChoreographer({ random: seeded(seed) })
  choreographer.start(text)
  const names: string[] = []
  for (let time = 0; time < seconds; time += 1 / 60) {
    const motion = choreographer.update(1 / 60, { blocked: false })
    if (motion)
      names.push(motion.name ?? '')
  }
  return names
}

const longText = 'Eu acho que isso e muito importante, porque voce precisa entender. Primeiro, calma. Depois, vamos ver tudo com cuidado e sem pressa nenhuma, certo?'

describe('speech gesture beats', () => {
  it('builds every kind as a valid motion without warnings', () => {
    for (const kind of beatKinds) {
      for (const side of ['left', 'right'] as const) {
        for (const amplitude of [0.6, 1, 1.4]) {
          const beat = buildBeat(kind, { side, amplitude, tempo: 1, random: seeded(7) })
          const result = parseCustomMotion(beat)
          expect(result.ok, `${kind} ${side} ${amplitude}`).toBe(true)
          if (result.ok)
            expect(result.warnings, `${kind} ${side} ${amplitude}`).toEqual([])
        }
      }
    }
  })

  it('changes the angles each time', () => {
    const random = seeded(3)
    const first = buildBeat('open_palm', { side: 'right', amplitude: 1, tempo: 1, random })
    const second = buildBeat('open_palm', { side: 'right', amplitude: 1, tempo: 1, random })
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(second))
  })
})

describe('speech gesture choreographer', () => {
  it('does not gesture before it starts or after it stops', () => {
    const choreographer = new SpeechGestureChoreographer({ random: seeded(1) })
    for (let index = 0; index < 600; index++)
      expect(choreographer.update(1 / 60, { blocked: false })).toBeNull()
    choreographer.start(longText)
    choreographer.stop()
    for (let index = 0; index < 600; index++)
      expect(choreographer.update(1 / 60, { blocked: false })).toBeNull()
  })

  it('waits a moment before the first gesture', () => {
    const choreographer = new SpeechGestureChoreographer({ random: seeded(2) })
    choreographer.start(longText)
    for (let index = 0; index < 24; index++)
      expect(choreographer.update(1 / 60, { blocked: false })).toBeNull()
  })

  it('does not gesture while the body is blocked', () => {
    const choreographer = new SpeechGestureChoreographer({ random: seeded(4) })
    choreographer.start(longText)
    for (let index = 0; index < 1200; index++)
      expect(choreographer.update(1 / 60, { blocked: true })).toBeNull()
  })

  it('does not gesture for an empty text', () => {
    expect(collect('   ', 5)).toEqual([])
  })

  it('uses many kinds and does not repeat the same kind back to back', () => {
    const kinds = new Set<string>()
    for (let seed = 1; seed <= 12; seed++) {
      const names = collect(longText.repeat(4), seed, 120)
      names.forEach((name, index) => {
        kinds.add(name)
        if (index > 0)
          expect(name).not.toBe(names[index - 1])
      })
    }
    expect(kinds.size).toBeGreaterThanOrEqual(12)
  })

  it('is deterministic for the same random source', () => {
    expect(collect(longText, 9)).toEqual(collect(longText, 9))
  })

  it('keeps a pause between gestures', () => {
    const names = collect(longText.repeat(4), 11, 60)
    // Under 60 s it cannot have more than one gesture every 1.5 s.
    expect(names.length).toBeLessThan(40)
    expect(names.length).toBeGreaterThan(3)
  })

  it('finds the roles of a clause', () => {
    expect(rolesOfClause('Como voce esta?').get('question')).toBeGreaterThan(0)
    expect(rolesOfClause('Nao, nunca mais').get('negation')).toBeGreaterThan(0)
    expect(rolesOfClause('Eu gosto disso').get('self')).toBeGreaterThan(0)
  })

  it('picks the finger count that the text says', () => {
    let counted = 0
    for (let seed = 1; seed <= 200; seed++) {
      const names = collect('Primeiro primeiro primeiro primeiro primeiro primeiro primeiro primeiro', seed, 30)
      for (const name of names) {
        if (name.startsWith('speech_count')) {
          counted++
          expect(name).toBe('speech_count_one')
        }
      }
    }
    expect(counted).toBeGreaterThan(0)
  })
})
