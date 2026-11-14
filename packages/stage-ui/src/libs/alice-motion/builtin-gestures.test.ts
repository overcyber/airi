import { describe, expect, it } from 'vitest'

import { builtinGestureOfEmoji, builtinGestureOfSpeech, SpeechGesturePicker } from './builtin-gestures'

describe('builtinGestureOfSpeech', () => {
  it('picks a built-in motion from Brazilian Portuguese speech', () => {
    expect(builtinGestureOfSpeech('Olá, eu sou a Alice.')).toBe('wave_hello')
    expect(builtinGestureOfSpeech('Boa noite! Tudo bem?')).toBe('wave_hello')
    expect(builtinGestureOfSpeech('Muito obrigada pela ajuda.')).toBe('bow')
    expect(builtinGestureOfSpeech('Parabéns, você conseguiu!')).toBe('celebrate')
    expect(builtinGestureOfSpeech('Sim, a luz está ligada.')).toBe('head_nod')
    expect(builtinGestureOfSpeech('Não, a porta está fechada.')).toBe('head_shake')
    expect(builtinGestureOfSpeech('Deixa eu ver a previsão.')).toBe('thinking')
    expect(builtinGestureOfSpeech('Até amanhã!')).toBe('wave_hello')
  })

  it('does not match a word inside another word', () => {
    expect(builtinGestureOfSpeech('Simone chegou em casa.')).toBeUndefined()
    expect(builtinGestureOfSpeech('A temperatura é de vinte graus.')).toBeUndefined()
  })
})

describe('builtinGestureOfEmoji', () => {
  it('picks a built-in motion from an emoji', () => {
    expect(builtinGestureOfEmoji('\u{1F44B}')).toBe('wave_hello')
    expect(builtinGestureOfEmoji('\u{270C}\u{FE0F}')).toBe('peace_sign')
    expect(builtinGestureOfEmoji('\u{1F973}')).toBe('celebrate')
    expect(builtinGestureOfEmoji('\u{1F600}')).toBeUndefined()
  })
})

describe('speechGesturePicker', () => {
  it('always plays a greeting, a goodbye, and a thank you, with another motion than the last one', () => {
    const picker = new SpeechGesturePicker({ random: () => 0.99 })

    expect(picker.pick('Olá! Que bom te ver.', 0)).toBe('wave_hello')
    // The same rule right after: the second motion of the rule, so she does not wave twice.
    expect(picker.pick('Oi de novo.', 500)).toBe('arms_open')
    expect(picker.pick('Obrigada.', 1000)).toBe('bow')
    expect(picker.pick('Até amanhã!', 1500)).toBe('wave_hello')
  })

  it('plays the other motions only now and then, and never twice within the gap', () => {
    // ROOT CAUSE:
    //
    // Every reply that starts with "Sim" nodded, and every "Olha" pointed. On the mirror the repetition read as a tic.
    //
    // We fixed this with a chance per speech and a minimum gap between two speech motions.
    const picker = new SpeechGesturePicker({ chance: 0.5, minimumGapMs: 10_000, random: () => 0.1 })

    expect(picker.pick('Sim, a luz está ligada.', 0)).toBe('head_nod')
    expect(picker.pick('Sim, a porta está fechada.', 5000)).toBeUndefined()
    expect(picker.pick('Sim, está tudo certo.', 12_000)).toBe('head_nod')

    const unlucky = new SpeechGesturePicker({ chance: 0.5, random: () => 0.9 })
    expect(unlucky.pick('Sim, a luz está ligada.', 0)).toBeUndefined()
    expect(unlucky.pick('Olá!', 0)).toBe('wave_hello')
  })

  it('gives nothing for a speech without a rule', () => {
    expect(new SpeechGesturePicker({ random: () => 0 }).pick('A temperatura é de vinte graus.', 0)).toBeUndefined()
  })
})
