/**
 * Mouth shapes of speech, in the set of the Oculus visemes that TalkingHead uses.
 * `sil` is a pause, `PP` closes the lips (p, b, m), and the vowels open the mouth.
 */
export type Viseme = 'sil' | 'PP' | 'FF' | 'DD' | 'kk' | 'CH' | 'SS' | 'nn' | 'RR' | 'aa' | 'E' | 'I' | 'O' | 'U'

/** One mouth shape of a text and its length in relative units. A full vowel is 1 unit. */
export interface VisemeStep {
  viseme: Viseme
  units: number
}

const vowelUnits = 1
/** An unstressed final vowel, for example the `e` of "noite", is short in Brazilian Portuguese. */
const reducedVowelUnits = 0.6
const consonantUnits: Record<string, number> = { PP: 0.7, FF: 0.6, DD: 0.5, kk: 0.5, CH: 0.7, SS: 0.7, nn: 0.5, RR: 0.45 }
const commaPauseUnits = 2
const sentencePauseUnits = 3.5

const vowelOf: Record<string, Viseme> = {
  a: 'aa',
  á: 'aa',
  à: 'aa',
  â: 'aa',
  ã: 'aa',
  e: 'E',
  é: 'E',
  ê: 'E',
  i: 'I',
  í: 'I',
  y: 'I',
  o: 'O',
  ó: 'O',
  ô: 'O',
  õ: 'O',
  u: 'U',
  ú: 'U',
  ü: 'U',
}

function isVowel(char: string | undefined) {
  return char !== undefined && char in vowelOf
}

/** `e` and `i` make a soft `c` and `g`, and the `u` of `qu` and `gu` silent. */
function isFrontVowel(char: string | undefined) {
  return char !== undefined && 'eéêií'.includes(char)
}

/**
 * Converts one word to mouth shapes with the letter rules of Brazilian Portuguese.
 *
 * The rules cover the sounds that change the lips: `ti` and `di` sound as "tchi" and "dji", a final `e` and `o`
 * sound as `i` and `u`, a final `l` sounds as `u`, and `m` or `n` after a vowel makes it nasal without closing the lips.
 */
function wordVisemes(word: string): VisemeStep[] {
  const steps: VisemeStep[] = []
  const push = (viseme: Viseme, units: number) => steps.push({ viseme, units })
  const consonant = (viseme: Viseme) => push(viseme, consonantUnits[viseme] ?? 0.5)
  /** A final `e` or `o`, alone or before a final `s`, as in "noite" and "carros". */
  const isFinalReduced = (index: number) => index === word.length - 1 || (index === word.length - 2 && word[word.length - 1] === 's')

  for (let i = 0; i < word.length; i++) {
    const char = word[i]
    const next = word[i + 1]

    if (isVowel(char)) {
      // "ão" and "õe": a nasal vowel that glides to u or i.
      if (char === 'ã' && next === 'o') {
        push('aa', vowelUnits)
        push('U', reducedVowelUnits)
        i++
        continue
      }
      let viseme = vowelOf[char]
      let units = vowelUnits
      if ((char === 'e' || char === 'o') && word.length > 1 && isFinalReduced(i)) {
        viseme = char === 'e' ? 'I' : 'U'
        units = reducedVowelUnits
      }
      push(viseme, units)
      continue
    }

    switch (char) {
      case 'c':
        if (next === 'h') {
          consonant('CH')
          i++
        }
        else {
          consonant(isFrontVowel(next) ? 'SS' : 'kk')
        }
        break
      case 'ç':
      case 's':
      case 'z':
        consonant('SS')
        if (next === char)
          i++
        break
      case 'x':
      case 'j':
        consonant('CH')
        break
      case 'g':
        if (next === 'u' && isFrontVowel(word[i + 2])) {
          consonant('kk')
          i++
        }
        else {
          consonant(isFrontVowel(next) ? 'CH' : 'kk')
        }
        break
      case 'q':
        consonant('kk')
        if (next === 'u' && isFrontVowel(word[i + 2]))
          i++
        break
      case 'k':
        consonant('kk')
        break
      case 't':
      case 'd': {
        // "ti", "di", and a final "te" or "de" sound as "tchi" and "dji".
        const softens = next === 'i' || next === 'í' || (next === 'e' && isFinalReduced(i + 1))
        consonant(softens ? 'CH' : 'DD')
        break
      }
      case 'l':
        if (next === 'h') {
          consonant('nn')
          i++
        }
        else if (isVowel(next)) {
          consonant('nn')
        }
        else {
          // A final l, as in "Brasil", sounds as u.
          push('U', reducedVowelUnits)
        }
        break
      case 'm':
      case 'n':
        if (next === 'h') {
          consonant('nn')
          i++
        }
        else if (isVowel(next)) {
          consonant(char === 'm' ? 'PP' : 'nn')
        }
        else if (char === 'm' && i === word.length - 1 && word[i - 1] === 'e') {
          // "bem", "também": the nasal e glides to i, and the lips stay open.
          push('I', reducedVowelUnits)
        }
        // Otherwise the m or n only makes the vowel before it nasal.
        break
      case 'p':
      case 'b':
        consonant('PP')
        break
      case 'f':
      case 'v':
        consonant('FF')
        break
      case 'r':
        consonant('RR')
        if (next === 'r')
          i++
        break
      case 'w':
        push('U', reducedVowelUnits)
        break
      default:
        // h is silent. Other letters and digits have no mouth shape here.
        break
    }
  }
  return steps
}

/**
 * Converts Brazilian Portuguese text to a sequence of mouth shapes with relative lengths.
 *
 * A comma adds a short pause and the end of a sentence a longer one. The lengths are relative, so the caller
 * scales them to the speech.
 *
 * @example
 * ptBrVisemes('Bom dia')
 * // => PP O, DD I aa (the m of "bom" only makes the o nasal)
 */
export function ptBrVisemes(text: string): VisemeStep[] {
  const steps: VisemeStep[] = []
  for (const token of text.toLowerCase().match(/\p{L}+|[,;:]|[.!?]+/gu) ?? []) {
    if (/^[,;:]$/.test(token))
      steps.push({ viseme: 'sil', units: commaPauseUnits })
    else if (/^[.!?]+$/.test(token))
      steps.push({ viseme: 'sil', units: sentencePauseUnits })
    else
      steps.push(...wordVisemes(token))
  }
  return steps
}
