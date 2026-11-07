import { describe, expect, it } from 'vitest'

import { builtinGestureOfEmoji, builtinGestureOfSpeech } from './builtin-gestures'

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
