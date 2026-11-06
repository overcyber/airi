/**
 * The wake word of the avatar microphone (Plan 06, F2), checked on the transcript of a phrase.
 *
 * The microphone sends a phrase to NeoAlice only when it starts with the wake word, for example
 * "Eva, que horas sao". The words after the wake word are the question. A phrase with only the
 * wake word opens the microphone for the next phrase.
 */

/** Words before the wake word that still count as a call, for example "oi Eva". */
const greetings = new Set(['oi', 'ei', 'hey', 'ola', 'e', 'ai', 'alo', 'bom', 'dia', 'boa', 'tarde', 'noite'])

/** Lower case, no accents, and no punctuation. "Évá!" gives "eva". */
export function normalizeSpeech(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Splits the setting into wake words. Commas separate the words, so one setting can hold the spellings
 * that the transcription gives, for example "Eva, Ewa".
 */
export function parseWakeWords(setting: string): string[] {
  return setting.split(',').map(normalizeSpeech).filter(word => word !== '')
}

export interface WakeWordMatch {
  /** The wake word as it is in the setting, normalized. */
  word: string
  /** The words after the wake word, as transcribed. Empty when the phrase was only the wake word. */
  rest: string
}

/**
 * Finds the wake word at the start of a transcript. Greetings before it are permitted, for example
 * "oi Eva". A wake word later in the phrase does not count, so talk about Eva does not wake her.
 *
 * Returns `undefined` when the phrase does not start with a wake word.
 */
export function matchWakeWord(transcript: string, wakeWords: readonly string[]): WakeWordMatch | undefined {
  const spoken = transcript.trim().split(/\s+/).filter(word => normalizeSpeech(word) !== '')
  const normalized = spoken.map(normalizeSpeech)
  for (const word of wakeWords) {
    const length = word.split(' ').length
    for (let start = 0; start + length <= normalized.length; start++) {
      if (normalized.slice(start, start + length).join(' ') === word)
        return { word, rest: spoken.slice(start + length).join(' ').replace(/^[\s,.:;!?-]+/, '') }
      if (!greetings.has(normalized[start]))
        break
    }
  }
  return undefined
}
