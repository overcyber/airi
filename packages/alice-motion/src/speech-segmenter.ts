/**
 * Settings of `SpeechSegmenter`. Times are in milliseconds.
 *
 * The defaults follow the NeoAlice satellites: 1200 ms of silence ends the speech.
 */
export interface SpeechSegmenterOptions {
  sampleRate: number
  /** RMS level that starts speech, from 0 to 1. */
  startLevel?: number
  /** RMS level that keeps speech going. Lower than `startLevel`, so short dips do not end it. */
  keepLevel?: number
  /** Loud audio for this time starts speech. */
  startMs?: number
  /** Silence for this time ends speech. */
  silenceMs?: number
  /** Audio before the start that the segment keeps, so the first syllable is not cut. */
  preRollMs?: number
  /** A shorter segment is dropped, for example a cough or a click. */
  minSpeechMs?: number
  /** A longer segment ends at this time. */
  maxSpeechMs?: number
}

export interface SpeechSegment {
  samples: Float32Array
  sampleRate: number
  durationMs: number
}

/** Root mean square of the samples, from 0 to 1. */
export function rootMeanSquare(samples: Float32Array): number {
  if (samples.length === 0)
    return 0
  let sum = 0
  for (const sample of samples)
    sum += sample * sample
  return Math.sqrt(sum / samples.length)
}

/**
 * Cuts microphone audio into speech segments, by level. It has no model, so it works offline.
 *
 * Before: chunks of mono samples, in order. After: one `SpeechSegment` for each spoken phrase.
 *
 * NeoAlice runs its own voice activity detection on the received audio, so this only has to find
 * the start and the end of a phrase.
 */
export class SpeechSegmenter {
  private readonly sampleRate: number
  private readonly startLevel: number
  private readonly keepLevel: number
  private readonly startSamples: number
  private readonly silenceSamples: number
  private readonly preRollSamples: number
  private readonly minSpeechSamples: number
  private readonly maxSpeechSamples: number

  private preRoll: Float32Array[] = []
  private preRollLength = 0
  private loudLength = 0
  private speech: Float32Array[] = []
  private speechLength = 0
  private silenceLength = 0
  private speaking = false

  constructor(options: SpeechSegmenterOptions) {
    const ms = (value: number) => Math.round(value * options.sampleRate / 1000)
    this.sampleRate = options.sampleRate
    this.startLevel = options.startLevel ?? 0.02
    this.keepLevel = options.keepLevel ?? 0.01
    this.startSamples = ms(options.startMs ?? 150)
    this.silenceSamples = ms(options.silenceMs ?? 1200)
    this.preRollSamples = ms(options.preRollMs ?? 300)
    this.minSpeechSamples = ms(options.minSpeechMs ?? 400)
    this.maxSpeechSamples = ms(options.maxSpeechMs ?? 15_000)
  }

  /** `true` while a phrase is open. */
  get inSpeech() {
    return this.speaking
  }

  /**
   * Adds a chunk. Returns the finished segment, when this chunk ends one.
   * The segment owns new memory: the caller can keep it.
   */
  push(chunk: Float32Array): SpeechSegment | undefined {
    const copy = new Float32Array(chunk)
    const level = rootMeanSquare(copy)

    if (!this.speaking) {
      this.keepPreRoll(copy)
      this.loudLength = level >= this.startLevel ? this.loudLength + copy.length : 0
      if (this.loudLength < this.startSamples)
        return undefined
      this.speaking = true
      this.speech = this.preRoll
      this.speechLength = this.preRollLength
      this.preRoll = []
      this.preRollLength = 0
      this.silenceLength = 0
      return undefined
    }

    this.speech.push(copy)
    this.speechLength += copy.length
    this.silenceLength = level >= this.keepLevel ? 0 : this.silenceLength + copy.length

    if (this.silenceLength >= this.silenceSamples || this.speechLength >= this.maxSpeechSamples)
      return this.finish()
    return undefined
  }

  /** Drops the open phrase, for example while the avatar speaks. */
  reset() {
    this.preRoll = []
    this.preRollLength = 0
    this.loudLength = 0
    this.speech = []
    this.speechLength = 0
    this.silenceLength = 0
    this.speaking = false
  }

  private keepPreRoll(chunk: Float32Array) {
    this.preRoll.push(chunk)
    this.preRollLength += chunk.length
    while (this.preRoll.length > 1 && this.preRollLength - this.preRoll[0].length >= this.preRollSamples) {
      this.preRollLength -= this.preRoll[0].length
      this.preRoll.shift()
    }
  }

  private finish(): SpeechSegment | undefined {
    // The trailing silence is not speech. Keep a short tail of it, like the pre-roll.
    const keptSilence = Math.min(this.silenceLength, this.preRollSamples)
    const length = this.speechLength - this.silenceLength + keptSilence
    const chunks = this.speech
    this.reset()
    if (length - keptSilence < this.minSpeechSamples)
      return undefined

    const samples = new Float32Array(length)
    let offset = 0
    for (const chunk of chunks) {
      if (offset >= length)
        break
      const part = chunk.subarray(0, length - offset)
      samples.set(part, offset)
      offset += part.length
    }
    return { samples, sampleRate: this.sampleRate, durationMs: Math.round(length * 1000 / this.sampleRate) }
  }
}
