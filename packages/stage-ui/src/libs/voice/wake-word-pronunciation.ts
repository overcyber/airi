/**
 * Suggests the model tokens of a wake word from its spelling, for a name in Portuguese or in English.
 *
 * The wake word model knows English phones (ARPAbet with a stress digit) and Chinese pinyin. It has no Portuguese. So
 * a Portuguese name is written with the English phones that sound closest. The result is a start for the user to
 * check and edit, not a certain answer: no model was run on it. A token that the model does not have never appears.
 */

const vowels = new Set(['a', 'e', 'i', 'o', 'u'])

/** Lower case, with the accent kept in a marker: `á` stays `á`, because an accent says where the stress is. */
function clean(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^a-záàâãéêíóôõúüç]/g, '')
}

/** A vowel with an accent mark, which says where the stress is. */
const accented = /[áàâéêíóôú]/

/** The letters without the accents, for the rules below. `ç` becomes `ss`, and the tilde stays as `~`. */
function plain(word: string): string {
  return word
    .replace(/ç/g, 'ss')
    .replace(/ã/g, 'a~')
    .replace(/õ/g, 'o~')
    .replace(/[áàâ]/g, 'a')
    .replace(/[éê]/g, 'e')
    .replace(/í/g, 'i')
    .replace(/[óô]/g, 'o')
    .replace(/[úü]/g, 'u')
}

/** Which vowel group takes the stress: the accent, else the Portuguese rule for the ending of the word. */
function stressIndex(original: string, groups: readonly string[]): number {
  const marked = [...original.matchAll(/[a-záàâãéêíóôõúüç]/g)].map(match => match[0])
  let group = -1
  let letterIndex = 0
  for (const letter of marked) {
    if (vowels.has(plain(letter)[0]) || letter === 'ã' || letter === 'õ') {
      // Count vowel groups: a new group starts after a consonant.
      const previous = marked[letterIndex - 1]
      if (previous === undefined || (!vowels.has(plain(previous)[0]) && previous !== 'ã' && previous !== 'õ'))
        group++
      if (accented.test(letter) || letter === 'ã' || letter === 'õ')
        return group
    }
    letterIndex++
  }
  if (groups.length < 2)
    return 0
  // Words that end in a, e, o, s, m or in am, em: the second to last syllable. The others: the last one.
  return /(?:[aeos]|[ae]m)$/.test(plain(original)) ? groups.length - 2 : groups.length - 1
}

function vowelTokens(letters: string, stressed: boolean, last: boolean): string[] {
  const stress = stressed ? '1' : '0'
  const swap: Record<string, string[]> = {
    'a~': [`AH${stress}`, 'N'],
    'o~': [`OW${stress}`, 'N'],
    'ai': [`AY${stress}`],
    'ei': [`EY${stress}`],
    'oi': [`OY${stress}`],
    'au': [`AW${stress}`],
    'ou': [`OW${stress}`],
    'eu': [`EH${stress}`, 'UW0'],
    'iu': [`IY${stress}`, 'UW0'],
    'ao': [`AW${stress}`],
  }
  if (swap[letters])
    return swap[letters]
  const single = letters[0]
  // A weak final vowel: the e of "Alice" sounds like a short i, and the o of "Rafael" no, but the o of "Eva" no.
  if (!stressed && last) {
    if (single === 'e')
      return ['IY0']
    if (single === 'o')
      return ['UW0']
    if (single === 'a')
      return ['AH0']
  }
  switch (single) {
    case 'a': return [stressed ? 'AA1' : 'AH0']
    case 'e': return [stressed ? 'EH1' : 'IY0']
    case 'i': return [`IY${stress}`]
    case 'o': return [stressed ? 'OW1' : 'UW0']
    case 'u': return [`UW${stress}`]
    default: return []
  }
}

/** The sound of one consonant letter, from the letters around it. `h` has no sound. */
function consonantTokens(letter: string, next: string | undefined, previous: string | undefined): string[] {
  const soft = next !== undefined && 'ei'.includes(next)
  const beforeVowel = next !== undefined && vowels.has(next)
  const afterVowel = previous !== undefined && vowels.has(previous)
  switch (letter) {
    case 'c': return [soft ? 'S' : 'K']
    case 'g': return [soft ? 'JH' : 'G']
    case 'j': return ['JH']
    case 'x': return ['SH']
    case 'k': return ['K']
    // The l at the end of a syllable sounds like a w in Brazilian Portuguese: "Raul", "Sol".
    case 'l': return [beforeVowel ? 'L' : 'W']
    case 's': return [afterVowel && beforeVowel ? 'Z' : 'S']
    case 'm': case 'n': case 'r': case 'y':
      return [letter.toUpperCase()]
    case 'b': case 'd': case 'f': case 'p': case 't': case 'v': case 'w': case 'z':
      return [letter.toUpperCase()]
    default:
      return []
  }
}

/** The phones of one word, before the vocabulary check. */
function wordTokens(original: string): string[] {
  const letters = plain(clean(original))
  if (letters === '')
    return []
  // Vowel groups, in order. A group is the vowels between two consonants.
  const groups = [...letters.matchAll(/[aeiou]~?(?:[iu](?![aeiou]))?/g)].map(match => match[0])
  const stressAt = stressIndex(clean(original), groups)
  const tokens: string[] = []
  let groupIndex = 0
  let index = 0
  while (index < letters.length) {
    const rest = letters.slice(index)
    const here = letters[index]
    const next = letters[index + 1]
    if (vowels.has(here)) {
      // Take the whole group that starts here.
      const group = groups[groupIndex] ?? here
      if (rest.startsWith(group)) {
        tokens.push(...vowelTokens(group, groupIndex === stressAt, groupIndex === groups.length - 1))
        index += group.length
        groupIndex++
        continue
      }
    }
    if (rest.startsWith('ch')) {
      tokens.push('CH')
      index += 2
      continue
    }
    if (rest.startsWith('lh')) {
      tokens.push('L', 'Y')
      index += 2
      continue
    }
    if (rest.startsWith('nh')) {
      tokens.push('N', 'Y')
      index += 2
      continue
    }
    if (rest.startsWith('rr')) {
      tokens.push('R')
      index += 2
      continue
    }
    if (rest.startsWith('ss')) {
      tokens.push('S')
      index += 2
      continue
    }
    if (rest.startsWith('qu') && next !== undefined) {
      tokens.push('K')
      index += (letters[index + 2] && 'ei'.includes(letters[index + 2])) ? 2 : 1
      continue
    }
    if (rest.startsWith('gu') && letters[index + 2] && 'ei'.includes(letters[index + 2])) {
      tokens.push('G')
      index += 2
      continue
    }
    if (rest.startsWith('sc') && letters[index + 2] && 'ei'.includes(letters[index + 2])) {
      tokens.push('S')
      index += 2
      continue
    }
    tokens.push(...consonantTokens(here, next, index > 0 ? letters[index - 1] : undefined))
    index++
  }
  return tokens
}

export interface PronunciationSuggestion {
  /** The tokens, with the stress digit on the stressed vowel. */
  tokens: string[]
  /** What the suggestion changed from the usual one, for the user. */
  note: 'main' | 'l-for-r'
}

/**
 * Suggests one or two pronunciations for a wake word. The second one says `R` as `L`, which the model hears more
 * often for a short name. A token that is not in `vocabulary` is dropped, and a suggestion with nothing left is dropped.
 *
 * @example
 * suggestPronunciations('Eva', vocabulary)
 * // => [{ tokens: ['EH1', 'V', 'AH0'], note: 'main' }]
 */
export function suggestPronunciations(text: string, vocabulary: ReadonlySet<string>): PronunciationSuggestion[] {
  const tokens = text
    .split(/\s+/)
    .flatMap(word => wordTokens(word))
    .filter(token => vocabulary.has(token))
  if (tokens.length === 0)
    return []
  const suggestions: PronunciationSuggestion[] = [{ tokens, note: 'main' }]
  if (tokens.includes('R') && vocabulary.has('L'))
    suggestions.push({ tokens: tokens.map(token => token === 'R' ? 'L' : token), note: 'l-for-r' })
  return suggestions
}

/** Reads a pronunciation that the user typed: tokens separated by spaces. */
export function parsePronunciation(line: string): string[] {
  return line.split(/\s+/).map(token => token.trim()).filter(token => token !== '')
}
