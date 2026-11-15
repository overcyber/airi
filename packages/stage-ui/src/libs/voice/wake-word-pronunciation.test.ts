import { describe, expect, it } from 'vitest'

import { parsePronunciation, suggestPronunciations } from './wake-word-pronunciation'

const phones = ['AA0', 'AA1', 'AH0', 'AH1', 'AW1', 'AY1', 'EH1', 'EY1', 'IY0', 'IY1', 'OW1', 'OY1', 'UW0', 'UW1', 'B', 'CH', 'D', 'F', 'G', 'JH', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'SH', 'T', 'V', 'W', 'Y', 'Z']
const vocabulary = new Set(phones)
const main = (text: string) => suggestPronunciations(text, vocabulary)[0]?.tokens.join(' ')

describe('suggestPronunciations', () => {
  it('writes a name with a stress digit on the stressed vowel', () => {
    // Eva: the stress is on the first syllable. The last a is short.
    expect(main('Eva')).toBe('EH1 V AH0')
    // Alice: a-LI-ce, the final e sounds like a short i.
    expect(main('Alice')).toBe('AH0 L IY1 S IY0')
  })

  it('follows the accent, and the rule for the end of the word', () => {
    expect(main('Júlia')).toBe('JH UW1 L IY0 AH0')
    // Raul: the last syllable is stressed, and the l at its end sounds like a w.
    expect(main('Raul')).toBe('R AW1 W')
    expect(main('Mariana')).toBe('M AH0 R IY0 AA1 N AH0')
  })

  it('writes the Portuguese digraphs and the soft letters', () => {
    expect(main('chave')).toBe('CH AA1 V IY0')
    expect(main('Bianca')).toContain('K')
    expect(main('Gisele')).toContain('JH')
    expect(main('Marilha')).toContain('Y')
  })

  it('joins the words of a phrase, and ignores what is not a letter', () => {
    expect(main('oi eva')).toBe(`${main('oi')} ${main('eva')}`)
    expect(main('Eva!!')).toBe(main('Eva'))
  })

  it('drops a token that the model does not have, and gives nothing for an empty word', () => {
    expect(suggestPronunciations('Eva', new Set(['EH1', 'V']))[0].tokens).toEqual(['EH1', 'V'])
    expect(suggestPronunciations('', vocabulary)).toEqual([])
    expect(suggestPronunciations('123', vocabulary)).toEqual([])
    expect(suggestPronunciations('Eva', new Set())).toEqual([])
  })

  it('offers a second pronunciation with L for R, only when the name has an R', () => {
    const maria = suggestPronunciations('Maria', vocabulary)
    expect(maria).toHaveLength(2)
    expect(maria[1].note).toBe('l-for-r')
    expect(maria[1].tokens.includes('R')).toBe(false)
    expect(suggestPronunciations('Eva', vocabulary)).toHaveLength(1)
  })
})

describe('parsePronunciation', () => {
  it('splits the tokens that the user typed', () => {
    expect(parsePronunciation('  EH1  V AH0 ')).toEqual(['EH1', 'V', 'AH0'])
    expect(parsePronunciation('')).toEqual([])
  })
})
