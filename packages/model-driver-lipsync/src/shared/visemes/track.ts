import type { Viseme, VisemeStep } from './pt-br'

/** Mouth shapes per second of voiced speech, a usual rate of a Brazilian Portuguese TTS voice. */
export const defaultUnitsPerSecond = 11

/** A pause of the text waits this long for a pause of the audio. Then the text goes on without it. */
const maxPauseWaitSeconds = 0.6
/** Silence of this length in the audio is a pause between phrases, not a gap of a consonant. */
const audioPauseSeconds = 0.15
/** When the audio pauses, a pause of the text this many units ahead is the same pause: the track jumps to it. */
const catchUpUnits = 4

/** Each sync at a pause moves the rate by this factor, toward the speed of the voice. */
const rateStep = 1.12
/** Range of the rate, in units per second of voiced speech. */
const minUnitsPerSecond = 6
const maxUnitsPerSecond = 20

/** The mouth shape of one frame of a {@link TextVisemeTrack}, and the next one for the blend. */
export interface VisemeFrame {
  current: Viseme
  next: Viseme
  /** How far the frame is through the current shape, from 0 to 1. */
  progress: number
  /** The text waits at a pause for the audio to pause too. The caller can follow the audio meanwhile. */
  waiting: boolean
}

/**
 * Plays the mouth shapes of a text along the speech audio, like the text lip sync of TalkingHead.
 *
 * The audio clock alone does not know where each word is. The cursor moves only while the audio has voice.
 * At a pause of the text (a comma or the end of a sentence), the cursor waits up to 0.6 s for a pause of the
 * audio. When the audio pauses first, the cursor jumps to a pause of the text close ahead. So each phrase starts
 * in step with the audio again.
 */
export class TextVisemeTrack {
  private index = 0
  /** Units already played of the current step. */
  private offset = 0
  private waitedSeconds = 0
  private silentSeconds = 0
  /** The audio was silent during the current pause of the text, so that pause is in step. */
  private pauseHeard = false

  private unitsPerSecond: number

  constructor(
    private readonly steps: readonly VisemeStep[],
    unitsPerSecond = defaultUnitsPerSecond,
  ) {
    this.unitsPerSecond = unitsPerSecond
  }

  /** The current rate, in units per second of voiced speech. It adapts to the voice at each pause. */
  get rate() {
    return this.unitsPerSecond
  }

  private adapt(factor: number) {
    this.unitsPerSecond = Math.min(maxUnitsPerSecond, Math.max(minUnitsPerSecond, this.unitsPerSecond * factor))
  }

  /** All steps played. The caller can go back to the audio lip sync. */
  get finished() {
    return this.index >= this.steps.length
  }

  /**
   * Moves the cursor by one frame and returns the mouth shape, or `null` when the track ended.
   *
   * @param deltaSeconds - The elapsed render time.
   * @param voiced - Whether the audio has voice in this frame.
   */
  update(deltaSeconds: number, voiced: boolean): VisemeFrame | null {
    const delta = Math.max(deltaSeconds, 0)
    this.silentSeconds = voiced ? 0 : this.silentSeconds + delta
    if (this.finished)
      return null

    if (voiced && this.steps[this.index].viseme === 'sil') {
      // The text reached a pause and the audio still speaks: wait a moment for the audio pause.
      this.waitedSeconds += delta
      if (this.waitedSeconds < maxPauseWaitSeconds && !this.pauseHeard)
        return this.frame(true)
      // The voice came back after the pause, or the audio has no pause here: the next word starts now.
      while (!this.finished && this.steps[this.index].viseme === 'sil')
        this.index++
      this.offset = 0
      this.waitedSeconds = 0
      this.pauseHeard = false
      if (this.finished)
        return null
    }
    else if (!voiced && this.silentSeconds >= audioPauseSeconds && this.steps[this.index].viseme !== 'sil') {
      // The audio paused before the text: the text is late, so it jumps to its pause close ahead.
      this.catchUp()
    }

    // A sound of the text waits while the audio is silent. A pause of the text goes on.
    if (!voiced && this.steps[this.index].viseme === 'sil' && !this.pauseHeard) {
      this.pauseHeard = true
      // The text waited at this pause for the audio: the voice is slower than the text.
      if (this.waitedSeconds > 0.15)
        this.adapt(1 / rateStep)
    }
    if (voiced || this.steps[this.index].viseme === 'sil') {
      this.waitedSeconds = 0
      this.offset += delta * this.unitsPerSecond
      while (!this.finished && this.offset >= this.steps[this.index].units) {
        this.offset -= this.steps[this.index].units
        this.index++
        this.pauseHeard = false
      }
      if (this.finished)
        return null
    }
    return this.frame(false)
  }

  private frame(waiting: boolean): VisemeFrame {
    const step = this.steps[this.index]
    return {
      current: step.viseme,
      next: this.steps[this.index + 1]?.viseme ?? 'sil',
      progress: Math.min(this.offset / step.units, 1),
      waiting,
    }
  }

  private catchUp() {
    let units = this.steps[this.index].units - this.offset
    for (let i = this.index + 1; i < this.steps.length && units <= catchUpUnits; i++) {
      if (this.steps[i].viseme === 'sil') {
        this.index = i
        this.offset = 0
        // The audio reached the pause before the text: the voice is faster than the text.
        this.adapt(rateStep)
        return
      }
      units += this.steps[i].units
    }
  }
}
