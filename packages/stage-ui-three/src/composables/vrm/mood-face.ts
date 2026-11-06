// Ported from Utsuwa, src/lib/engine/expression-compose.ts and src/lib/engine/mood-expression.ts
// https://github.com/JuiceBoxxGames/utsuwa (AGPL-3.0-or-later).
// Changes for AIRI: the mood keys are the VRM expression names that AIRI sends
// (happy, sad, angry, surprised, relaxed, think, neutral), intensity is 0..1, the
// mouth stays with the AIRI lip sync, and the photo mode and manual layers are removed.

/** A mood or reaction expression with its target weight. */
export interface FaceTarget {
  name: string
  weight: number
  /** The mood key of {@link moodFaces}, for the ARKit shapes of the mood. */
  key?: string
}

interface FlashFace extends FaceTarget {
  /** Seconds since the reaction started, on the frame clock. */
  t: number
  /** Reaction time when the release started. Fixed once set, so late speech cannot pop it back. */
  holdUntil: number | null
}

interface BlinkState {
  timerSeconds: number
  nextSeconds: number
  active: boolean
  progress: number
}

export interface MoodFaceFrameInput {
  deltaSeconds: number
  speaking: boolean
  /** A body emote plays. The mood face yields and the blink stops, as in Utsuwa. */
  emotePlaying: boolean
}

/**
 * Candidates per mood, VRM 1.0 preset first, then VRM 0.x names. `scale` is the weight
 * at full intensity. Faces read strong fast, so the scales stay low.
 * Keys are the names AIRI sends (`EMOTION_VRMExpressionName_value`), mapped to the
 * nearest Utsuwa mood: happy, sad, frustrated (angry), flustered (surprised),
 * content (relaxed), curious (think).
 */
const moodFaces: Record<string, { candidates: string[], scale: number } | null> = {
  happy: { candidates: ['happy', 'joy'], scale: 0.75 },
  sad: { candidates: ['sad', 'sorrow'], scale: 0.8 },
  angry: { candidates: ['angry'], scale: 0.7 },
  surprised: { candidates: ['surprised'], scale: 0.55 },
  relaxed: { candidates: ['relaxed', 'fun'], scale: 0.6 },
  think: { candidates: ['think', 'surprised'], scale: 0.3 },
  neutral: null,
}

/**
 * ARKit shapes of each mood at full intensity, for a model that has them as expressions (for example Eva,
 * converted from Ready Player Me). The NeoAlice avatar showed these faces, so the VRM shows the same.
 *
 * `sad`, `angry`, and `surprised` (NeoAlice `fear`) are the mood baselines of TalkingHead
 * (MIT, https://github.com/met4citizen/TalkingHead, `modules/talkinghead.mjs`, `animMoods`).
 * TalkingHead makes its happy face with animated smiles, so `happy` here is a held smile.
 * The eye look shapes stay with the look-at, and the blink shapes stay with the blink layer.
 */
const arkitMoodShapes: Record<string, Record<string, number>> = {
  happy: { mouthSmileLeft: 0.6, mouthSmileRight: 0.6, cheekSquintLeft: 0.4, cheekSquintRight: 0.4, eyeSquintLeft: 0.3, eyeSquintRight: 0.3, browInnerUp: 0.15 },
  sad: { browDownRight: 0.1, browInnerUp: 0.6, browOuterUpRight: 0.2, eyeSquintLeft: 0.7, eyeSquintRight: 0.7, mouthFrownLeft: 0.8, mouthFrownRight: 0.8, mouthLeft: 0.2, mouthPucker: 0.5, mouthRollLower: 0.2, mouthRollUpper: 0.2, mouthShrugLower: 0.2, mouthShrugUpper: 0.2, mouthStretchLeft: 0.4 },
  angry: { browDownLeft: 0.6, browDownRight: 0.6, jawForward: 0.3, mouthFrownLeft: 0.7, mouthFrownRight: 0.7, mouthRollLower: 0.2, mouthShrugLower: 0.3 },
  surprised: { browInnerUp: 0.7, eyeSquintLeft: 0.5, eyeSquintRight: 0.5, eyeWideLeft: 0.6, eyeWideRight: 0.6, mouthClose: 0.1, mouthFunnel: 0.3, mouthShrugLower: 0.5, mouthShrugUpper: 0.5 },
  relaxed: { mouthSmileLeft: 0.3, mouthSmileRight: 0.3, eyeSquintLeft: 0.2, eyeSquintRight: 0.2 },
}

/** The VRM 1.0 expressions that hold a mood. See {@link releaseMoodOverrides}. */
const moodExpressionNames = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'joy', 'sorrow', 'fun']

/** The part of `VRMExpressionManager` that {@link releaseMoodOverrides} changes. */
interface MoodExpressionManager {
  getExpression: (name: string) => { overrideMouth: string, overrideBlink: string } | null | undefined
}

/**
 * Lets the lip sync and the blink run while a mood face shows.
 *
 * A VRM 1.0 emotion with `overrideMouth: blend` scales the mouth shapes down by its own weight. That fits a
 * short emotion. The mood face of NeoAlice stays for minutes, so `sad` at 0.8 would leave 20% of the lip sync.
 * Same for the blink. The function sets both overrides of the mood expressions to `none`, once per load.
 */
export function releaseMoodOverrides(expressionManager: MoodExpressionManager | undefined) {
  for (const name of moodExpressionNames) {
    const expression = expressionManager?.getExpression(name)
    if (!expression)
      continue
    expression.overrideMouth = 'none'
    expression.overrideBlink = 'none'
  }
}

const blinkNames = ['blink', 'Blink', 'eyeBlinkLeft', 'eyeBlinkRight']

/** Weight of the happy face while a body emote plays. */
const emoteFaceWeight = 0.7

/**
 * Resting mood face, short reactions, blink, and the emote face of a VRM model.
 *
 * Layers, top wins for the expression it touches:
 * 1. Emote face: happy at 0.7 while a body emote plays.
 * 2. Reaction (flash): attack 0.25 s, hold 2.5 s (up to 8 s while speaking), release 0.8 s.
 * 3. Mood: eases toward its target at rate 1.5/s. A new mood waits until the old one
 *    faded out, so two moods never blend into a muddled face.
 * The blink runs every 2 to 6 s, about 0.125 s long, and stops during a body emote.
 *
 * {@link update} returns the weights to write before `expressionManager.update()`.
 * All time comes from the frame delta.
 */
export class MoodFace {
  private mood: FaceTarget | null = null
  private moodTarget: FaceTarget | null = null
  private flash: FlashFace | null = null
  private readonly blink: BlinkState
  private readonly emoteFace: string | null
  private emoteFaceActive = false
  /** The ARKit shapes that the last frame wrote, so a mood change sets them back to 0. */
  private arkitWritten = new Set<string>()

  constructor(
    private readonly expressionNames: readonly string[],
    private readonly random: () => number = Math.random,
  ) {
    this.blink = { timerSeconds: 0, nextSeconds: this.nextBlinkIn(), active: false, progress: 0 }
    this.emoteFace = findHappyExpression(expressionNames)
  }

  /** The current resting mood name, or `null` for neutral. */
  get moodName(): string | null {
    return this.moodTarget?.name ?? null
  }

  /**
   * Sets the resting mood that stays until the next mood. `intensity` is 0 to 1.
   * `neutral`, an unknown mood, or a model without a matching expression clears it.
   */
  setMood(mood: string, intensity = 1) {
    this.moodTarget = targetFor(mood, intensity, this.expressionNames, 'mood')
  }

  /** Shows a short reaction on top of the mood. Same mapping as the mood, stronger and capped. */
  react(mood: string, weightOverride?: number) {
    const target = targetFor(mood, 1, this.expressionNames, 'flash')
    if (!target)
      return
    this.flash = { name: target.name, weight: weightOverride ?? target.weight, t: 0, holdUntil: null }
  }

  /** Advances one frame and returns the expression weights to write. */
  update(input: MoodFaceFrameInput): Map<string, number> {
    const { deltaSeconds: delta } = input
    const face = new Map<string, number>()
    const emoteName = input.emotePlaying ? this.emoteFace : null

    if (emoteName) {
      face.set(emoteName, emoteFaceWeight)
      this.emoteFaceActive = true
    }
    else if (this.emoteFaceActive && this.emoteFace) {
      // The emote ended. Release its face once; the mood layer below may take it again.
      face.set(this.emoteFace, 0)
      this.emoteFaceActive = false
    }

    // Mood face. Swapping expressions fades the old one fully out before the new one starts.
    const moodGoal = input.emotePlaying ? null : this.moodTarget
    const moodStep = Math.min(1, delta * 1.5)
    let mood = this.mood ? { ...this.mood } : null
    if (mood && mood.name !== moodGoal?.name) {
      mood.weight -= mood.weight * moodStep
      if (mood.weight < 0.01)
        mood.weight = 0
    }
    else if (moodGoal) {
      mood ??= { name: moodGoal.name, weight: 0, key: moodGoal.key }
      mood.weight += (moodGoal.weight - mood.weight) * moodStep
    }
    // The ARKit shapes of the mood follow the weight of its expression, so they ease in and out with it.
    const arkit = new Map<string, number>()
    const shapes = mood?.key ? arkitMoodShapes[mood.key] : undefined
    const scale = mood?.key ? moodFaces[mood.key]?.scale : undefined
    if (mood && shapes && scale) {
      const share = Math.min(1, mood.weight / scale)
      for (const [name, weight] of Object.entries(shapes)) {
        if (this.expressionNames.includes(name))
          arkit.set(name, Math.round(weight * share * 1000) / 1000)
      }
    }
    for (const name of this.arkitWritten) {
      if (!arkit.has(name))
        face.set(name, 0)
    }
    for (const [name, weight] of arkit)
      face.set(name, weight)
    this.arkitWritten = new Set(arkit.keys())
    if (mood) {
      if (emoteName !== mood.name)
        face.set(mood.name, mood.weight)
      if (mood.weight === 0)
        mood = null
    }
    this.mood = mood

    // Reaction: attack 0.25 s, hold 2.5 s (longer while she speaks, up to 8 s), release 0.8 s.
    let flash = this.flash ? { ...this.flash } : null
    if (flash) {
      flash.t += delta
      if (flash.holdUntil === null) {
        const holdEnd = input.speaking ? Math.min(8, Math.max(2.5, flash.t + 0.01)) : 2.5
        if (flash.t >= holdEnd)
          flash.holdUntil = flash.t
      }
      const shape = flash.holdUntil === null
        ? Math.min(1, flash.t / 0.25)
        : 1 - (flash.t - flash.holdUntil) / 0.8
      const owned = emoteName === flash.name
      if (shape <= 0) {
        if (!owned && mood?.name !== flash.name)
          face.set(flash.name, 0)
        flash = null
      }
      else if (!owned) {
        // Never dip the resting face on the same expression.
        face.set(flash.name, Math.max(mood?.name === flash.name ? mood.weight : 0, flash.weight * shape))
      }
    }
    this.flash = flash

    // Blink, idle only, off during emotes: about 0.125 s, quick close (30%), slow open (70%).
    const blink = this.blink
    if (!input.emotePlaying) {
      blink.timerSeconds += delta
      if (!blink.active && blink.timerSeconds >= blink.nextSeconds) {
        blink.active = true
        blink.progress = 0
      }
      if (blink.active) {
        blink.progress += delta * 8
        const value = blink.progress < 0.3 ? blink.progress / 0.3 : 1 - (blink.progress - 0.3) / 0.7
        let weight = Math.max(0, value)
        if (blink.progress >= 1) {
          blink.active = false
          blink.timerSeconds = 0
          blink.nextSeconds = this.nextBlinkIn()
          weight = 0
        }
        for (const name of blinkNames) {
          if (this.expressionNames.includes(name))
            face.set(name, weight)
        }
      }
    }
    else if (blink.active) {
      // An emote that starts mid-blink must not leave the eyelid half closed.
      blink.active = false
      blink.timerSeconds = 0
      for (const name of blinkNames) {
        if (this.expressionNames.includes(name))
          face.set(name, 0)
      }
    }

    return face
  }

  private nextBlinkIn() {
    return this.random() * 4 + 2
  }
}

/** Picks the expression of a mood, or `null` for neutral or no match. */
function targetFor(mood: string, intensity: number, available: readonly string[], kind: 'mood' | 'flash'): FaceTarget | null {
  const key = mood.trim().toLowerCase()
  const face = moodFaces[key]
  if (!face)
    return null
  const name = pickCandidate(face.candidates, available)
  if (!name)
    return null
  if (kind === 'flash')
    return { name, weight: Math.round(Math.min(0.9, face.scale * 1.4) * 1000) / 1000 }
  const clamped = Math.max(0, Math.min(1, intensity))
  const weight = Math.round(face.scale * clamped * 1000) / 1000
  return weight > 0 ? { name, weight, key } : null
}

function pickCandidate(candidates: string[], available: readonly string[]): string | undefined {
  for (const candidate of candidates) {
    const name = available.find(n => n.toLowerCase() === candidate)
    if (name)
      return name
  }
  return undefined
}

/** Emotes wear a happy face. Works with any model naming. */
export function findHappyExpression(names: readonly string[]): string | null {
  for (const keyword of ['happy', 'joy', 'smile', 'fun', 'cheerful']) {
    const match = names.find(name => name.toLowerCase().includes(keyword))
    if (match)
      return match
  }
  return null
}
