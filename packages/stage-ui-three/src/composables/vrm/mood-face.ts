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
 * at full intensity. Faces read strong fast, so the scales stay low. A mood stays for minutes on the
 * NeoAlice avatar, so a resting face is a hint of the mood, not a grimace.
 * Keys are the names AIRI sends (`EMOTION_VRMExpressionName_value`), mapped to the
 * nearest Utsuwa mood: happy, sad, frustrated (angry), flustered (surprised),
 * content (relaxed), curious (think).
 */
const moodFaces: Record<string, { candidates: string[], scale: number } | null> = {
  happy: { candidates: ['happy', 'joy'], scale: 0.55 },
  sad: { candidates: ['sad', 'sorrow'], scale: 0.55 },
  angry: { candidates: ['angry'], scale: 0.5 },
  surprised: { candidates: ['surprised'], scale: 0.45 },
  relaxed: { candidates: ['relaxed', 'fun'], scale: 0.45 },
  think: { candidates: ['think', 'surprised'], scale: 0.25 },
  neutral: null,
}

/** Weight of a reaction: a little over the resting mood, never a full face. */
const reactionGain = 1.2
const reactionMaxWeight = 0.65

/**
 * ARKit shapes of each mood at full intensity, for a model that has them as expressions (for example Eva,
 * converted from Ready Player Me). The NeoAlice avatar showed these faces, so the VRM shows the same.
 *
 * `sad`, `angry`, and `surprised` (NeoAlice `fear`) come from the mood baselines of TalkingHead
 * (MIT, https://github.com/met4citizen/TalkingHead, `modules/talkinghead.mjs`, `animMoods`), at about
 * 60% of their weight: on a VRM with the full ARKit set, the TalkingHead values read as a grimace.
 * TalkingHead makes its happy face with animated smiles, so `happy` here is a held smile.
 * The eye look shapes stay with the look-at, and the blink shapes stay with the blink layer.
 */
const arkitMoodShapes: Record<string, Record<string, number>> = {
  happy: { mouthSmileLeft: 0.45, mouthSmileRight: 0.45, cheekSquintLeft: 0.25, cheekSquintRight: 0.25, eyeSquintLeft: 0.2, eyeSquintRight: 0.2, browInnerUp: 0.1 },
  sad: { browDownRight: 0.05, browInnerUp: 0.45, browOuterUpRight: 0.1, eyeSquintLeft: 0.35, eyeSquintRight: 0.35, mouthFrownLeft: 0.5, mouthFrownRight: 0.5, mouthLeft: 0.1, mouthPucker: 0.25, mouthRollLower: 0.1, mouthRollUpper: 0.1, mouthShrugLower: 0.1, mouthShrugUpper: 0.1, mouthStretchLeft: 0.2 },
  angry: { browDownLeft: 0.5, browDownRight: 0.5, jawForward: 0.15, mouthFrownLeft: 0.45, mouthFrownRight: 0.45, mouthRollLower: 0.1, mouthShrugLower: 0.2 },
  surprised: { browInnerUp: 0.5, eyeSquintLeft: 0.2, eyeSquintRight: 0.2, eyeWideLeft: 0.45, eyeWideRight: 0.45, mouthClose: 0.05, mouthFunnel: 0.2, mouthShrugLower: 0.25, mouthShrugUpper: 0.25 },
  relaxed: { mouthSmileLeft: 0.3, mouthSmileRight: 0.3, eyeSquintLeft: 0.2, eyeSquintRight: 0.2 },
  // Not from TalkingHead, which has no thinking mood: one brow up, lips pressed to the side.
  think: { browInnerUp: 0.3, browOuterUpLeft: 0.3, browDownRight: 0.25, mouthPressLeft: 0.3, mouthRollLower: 0.15, mouthLeft: 0.2, eyeSquintRight: 0.2 },
}

/**
 * An emoji face of TalkingHead has shapes at 1, for example a frown or a stretched mouth, made for its own
 * avatar in a 3 s animation. Held on a VRM, they read as a grimace. Each shape stops at the cap, then scales.
 */
const emojiFaceCap = 0.7
const emojiFaceScale = 0.85

/**
 * Lower caps for the shapes that turn a smile into a grimace on a realistic face: a wide smile with the
 * upper lip up, the nose wrinkled, and the eyes squeezed shut is the grin of the Joker. Matched by prefix.
 */
const emojiShapeCaps: Array<[prefix: string, cap: number]> = [
  ['mouthSmile', 0.5],
  ['mouthUpperUp', 0.2],
  ['mouthLowerDown', 0.3],
  ['mouthDimple', 0.15],
  ['mouthStretch', 0.35],
  ['mouthPress', 0.3],
  ['mouthFrown', 0.55],
  ['noseSneer', 0.2],
  ['cheekSquint', 0.3],
  ['eyeSquint', 0.35],
  ['eyeWide', 0.5],
  ['jawOpen', 0.3],
  ['mouthOpen', 0.3],
  ['browInnerUp', 0.5],
  ['browDown', 0.6],
]

/** The weight that an emoji shape of TalkingHead gets on the VRM. `name` picks the cap of the shape. */
export function emojiShapeWeight(weight: number, name = '') {
  const cap = emojiShapeCaps.find(([prefix]) => name.startsWith(prefix))?.[1] ?? emojiFaceCap
  return Math.round(Math.min(weight, cap) * emojiFaceScale * 1000) / 1000
}

/** The smile of the emote face and of a warm bond on a model with the ARKit shapes, at weight 1. */
const arkitSmileShapes: Record<string, number> = { mouthSmileLeft: 1, mouthSmileRight: 1, cheekSquintLeft: 0.5, cheekSquintRight: 0.5 }
/** Smile of the emote face on an ARKit model. It joins the mood by the larger weight, never by a sum. */
const arkitEmoteSmile = 0.3

/** Other names of the preset expressions, in lower case: VRM 0.x and common model names. */
const presetAliases: Record<string, string[]> = {
  happy: ['joy'],
  sad: ['sorrow'],
  blink: ['blink'],
  blinkLeft: ['blinkleft', 'blink_l'],
  blinkRight: ['blinkright', 'blink_r'],
  aa: ['a'],
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

const blinkPresetNames = ['blink', 'Blink']
const blinkShapeNames = ['eyeBlinkLeft', 'eyeBlinkRight']

/**
 * The expressions that close the eyes: the blink preset, or the two ARKit shapes on a model without it.
 * Never both: on Eva the preset is the two shapes, and both together closed the eyelids twice as far.
 */
export function blinkExpressionsOf(names: readonly string[]): string[] {
  const preset = blinkPresetNames.find(name => names.includes(name))
  return preset ? [preset] : blinkShapeNames.filter(name => names.includes(name))
}

/** Expressions that hold a mood, a reaction, or the emote face. Their presets can move the mouth. */
const moodPresetNames = new Set(['happy', 'angry', 'sad', 'relaxed', 'surprised', 'joy', 'sorrow', 'fun'])
const visemeNames = new Set(['aa', 'ih', 'ou', 'ee', 'oh'])

/**
 * The share of an expression that stays while she speaks. The lip sync owns the mouth, so a smile or a frown
 * must not pull the lips together. ARKit mouth and jaw shapes and the visemes go to 0. A mood preset goes to 0
 * on a model with ARKit shapes, because its eyes and brows are separate shapes there. On other models (for
 * example VRoid) the preset is the whole face, so 30% of it stays.
 */
export function speechShareOf(name: string, hasArkit: boolean): number {
  if (/^(?:mouth|jaw)/.test(name) || visemeNames.has(name))
    return 0
  if (moodPresetNames.has(name))
    return hasArkit ? 0 : 0.3
  return 1
}

/** Rate of the change between the speech face and the resting face, per second (about 0.3 s). */
const speechFaceRate = 10

/** Weight of the happy face while a body emote plays. A light smile: a bow or a head shake with a grin looks wrong. */
const emoteFaceWeight = 0.4

/**
 * Resting mood face, short reactions, blink, and the emote face of a VRM model.
 *
 * Layers, top wins for the expression it touches:
 * 1. Emote face: happy at 0.4 while a body emote plays.
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
  /** The bond from the companion state: warmth and energy, 0 to 1. Neutral until it arrives. */
  private bond = { warmth: 0.5, energy: 0.7 }
  /** An emoji face: its expression weights and its time on the frame clock. */
  private emojiFace: { weights: Map<string, number>, t: number } | null = null
  /** The ARKit shapes that the last frame wrote, so a mood change sets them back to 0. */
  private arkitWritten = new Set<string>()
  /** How far the mouth shapes of the face have moved out for the lip sync: 0 at rest, 1 while she speaks. */
  private speechFace = 0
  private readonly hasArkit: boolean
  private readonly blinkExpressions: string[]

  constructor(
    private readonly expressionNames: readonly string[],
    private readonly random: () => number = Math.random,
  ) {
    this.blink = { timerSeconds: 0, nextSeconds: this.nextBlinkIn(), active: false, progress: 0 }
    this.emoteFace = findHappyExpression(expressionNames)
    this.hasArkit = expressionNames.includes('mouthSmileLeft')
    this.blinkExpressions = blinkExpressionsOf(expressionNames)
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
    this.flash = { name: target.name, weight: weightOverride ?? target.weight, key: target.key, t: 0, holdUntil: null }
  }

  /**
   * Sets the bond of Alice with the owner (companion state, 0 to 1). A warm bond keeps a light smile at rest,
   * never over a sad, angry, or surprised mood. Low energy makes the eyelids heavy. NeoAlice decides the bond.
   */
  setBond(bond: { warmth: number, energy: number }) {
    this.bond = { warmth: Math.min(1, Math.max(0, bond.warmth)), energy: Math.min(1, Math.max(0, bond.energy)) }
  }

  /**
   * Shows the face of an emoji for about 3 s: ARKit shape weights (see `talkinghead-emoji-faces.ts`) on a model
   * that has them, plus the preset expressions of the same face, so a model with presets only shows it too.
   * Returns `false` when the model has none of the expressions of the face.
   */
  showFace(shapes: Readonly<Record<string, number>>) {
    const weights = new Map<string, number>()
    // The presets of the face are for a model without the ARKit shapes. On Eva they would add a second smile.
    const presets = this.hasArkit ? {} : presetsOfFace(shapes)
    for (const [name, weight] of [...Object.entries(shapes), ...Object.entries(presets)]) {
      // The look-at owns the eye direction. An eye look shape under it would turn one layer against the other.
      if (name.startsWith('eyeLook'))
        continue
      const own = pickCandidate([name.toLowerCase(), ...(presetAliases[name] ?? [])], this.expressionNames)
      if (own)
        weights.set(own, Math.max(weights.get(own) ?? 0, emojiShapeWeight(weight, name)))
    }
    if (weights.size === 0)
      return false
    this.emojiFace = { weights, t: 0 }
    return true
  }

  /** Advances one frame and returns the expression weights to write. */
  update(input: MoodFaceFrameInput): Map<string, number> {
    const { deltaSeconds: delta } = input
    const face = new Map<string, number>()
    const emoteName = input.emotePlaying ? this.emoteFace : null

    if (emoteName) {
      // On an ARKit model the smile of the emote is ARKit shapes below, so it cannot add to the mood smile.
      face.set(emoteName, this.hasArkit ? 0 : emoteFaceWeight)
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
    if (mood) {
      // On a model with the ARKit shapes, the mood is those shapes only. Its preset is the same shapes again
      // (the converter builds it from them), and both together made a grin twice as wide as either.
      if (emoteName !== mood.name)
        face.set(mood.name, this.hasArkit && shapes ? 0 : mood.weight)
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
        // Never dip the resting face on the same expression. On an ARKit model the reaction is its shapes only.
        const flashPreset = this.hasArkit && flash.key && arkitMoodShapes[flash.key] ? 0 : flash.weight * shape
        face.set(flash.name, Math.max(mood?.name === flash.name ? face.get(mood.name) ?? 0 : 0, flashPreset))
      }
    }
    this.flash = flash

    // A reaction moves the ARKit shapes of its mood too, for example the frown of a sad emoji on Eva.
    const flashShapes = flash?.key ? arkitMoodShapes[flash.key] : undefined
    if (flash && flashShapes && emoteName !== flash.name) {
      const shape = flash.holdUntil === null ? Math.min(1, flash.t / 0.25) : 1 - (flash.t - flash.holdUntil) / 0.8
      for (const [name, weight] of Object.entries(flashShapes)) {
        if (this.expressionNames.includes(name))
          arkit.set(name, Math.max(arkit.get(name) ?? 0, Math.round(weight * Math.max(0, shape) * 1000) / 1000))
      }
    }
    // Emoji face: attack 0.2 s, hold 2.2 s, release 0.6 s. It goes over the mood, never under it.
    const emoji = this.emojiFace
    if (emoji) {
      emoji.t += delta
      const shape = emoji.t < 0.2 ? emoji.t / 0.2 : emoji.t < 2.4 ? 1 : 1 - (emoji.t - 2.4) / 0.6
      if (shape <= 0) {
        this.emojiFace = null
      }
      else if (!input.emotePlaying) {
        for (const [name, weight] of emoji.weights)
          arkit.set(name, Math.max(arkit.get(name) ?? 0, Math.round(weight * shape * 1000) / 1000))
      }
    }
    // The bond: a light smile at rest when the bond is warm, heavy eyelids when her energy is low.
    const moodKey = this.mood?.key ?? this.moodTarget?.key
    // Every smile on an ARKit model goes through the same shapes and joins by the larger weight. A preset
    // on top of the shapes is a sum, and three light smiles in a sum are one grin.
    const smiles: number[] = []
    if (this.hasArkit && emoteName)
      smiles.push(arkitEmoteSmile)
    if (this.bond.warmth > 0.5 && !['sad', 'angry', 'surprised'].includes(moodKey ?? '')) {
      const smile = pickCandidate(['relaxed', 'fun'], this.expressionNames)
      if (this.hasArkit)
        smiles.push((this.bond.warmth - 0.5) * 0.3)
      else if (smile)
        arkit.set(smile, Math.max(arkit.get(smile) ?? 0, Math.round((this.bond.warmth - 0.5) * 0.5 * 1000) / 1000))
    }
    for (const smile of smiles) {
      for (const [name, share] of Object.entries(arkitSmileShapes)) {
        if (this.expressionNames.includes(name))
          arkit.set(name, Math.max(arkit.get(name) ?? 0, Math.round(smile * share * 1000) / 1000))
      }
    }
    if (this.bond.energy < 0.4 && !input.emotePlaying) {
      const lids = pickCandidate(['blink'], this.expressionNames)
      if (lids)
        arkit.set(lids, Math.max(arkit.get(lids) ?? 0, Math.round((0.4 - this.bond.energy) * 0.6 * 1000) / 1000))
    }
    for (const name of this.arkitWritten) {
      if (!arkit.has(name) && !face.has(name))
        face.set(name, 0)
    }
    for (const [name, weight] of arkit)
      face.set(name, Math.max(face.get(name) ?? 0, weight))
    this.arkitWritten = new Set(arkit.keys())

    // While she speaks, the mouth shapes of the mood, the reactions, and the emoji faces move out for the lip sync.
    this.speechFace += ((input.speaking ? 1 : 0) - this.speechFace) * Math.min(1, delta * speechFaceRate)
    if (this.speechFace > 0.001) {
      for (const [name, weight] of face) {
        const share = speechShareOf(name, this.hasArkit)
        if (share < 1)
          face.set(name, weight * (1 - this.speechFace * (1 - share)))
      }
    }

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
        for (const name of this.blinkExpressions)
          face.set(name, weight)
      }
    }
    else if (blink.active) {
      // An emote that starts mid-blink must not leave the eyelid half closed.
      blink.active = false
      blink.timerSeconds = 0
      for (const name of this.blinkExpressions)
        face.set(name, 0)
    }

    return face
  }

  private nextBlinkIn() {
    return this.random() * 4 + 2
  }
}

/**
 * The preset expressions of a face of ARKit shapes, for a model without ARKit shapes: a smile is `happy`,
 * a frown with low brows is `angry`, closed eyes are `blink` (or a wink), an open jaw is `aa`.
 */
export function presetsOfFace(shapes: Readonly<Record<string, number>>): Record<string, number> {
  const max = (...names: string[]) => Math.max(0, ...names.map(name => shapes[name] ?? 0))
  const smile = max('mouthSmileLeft', 'mouthSmileRight')
  const frown = max('mouthFrownLeft', 'mouthFrownRight')
  const browDown = max('browDownLeft', 'browDownRight')
  const wide = max('eyeWideLeft', 'eyeWideRight')
  const jaw = max('jawOpen', 'mouthOpen')
  const left = shapes.eyeBlinkLeft ?? 0
  const right = shapes.eyeBlinkRight ?? 0
  const presets: Record<string, number> = {}
  if (smile >= 0.3)
    presets.happy = Math.min(0.9, smile)
  if (browDown >= 0.5 && frown >= 0.5)
    presets.angry = 0.8
  else if (frown >= 0.5)
    presets.sad = 0.8
  if ((wide >= 0.4 || jaw >= 0.5) && smile < 0.3)
    presets.surprised = 0.7
  if (Math.abs(left - right) >= 0.4)
    presets[left > right ? 'blinkLeft' : 'blinkRight'] = Math.max(left, right) * 0.9
  else if (Math.min(left, right) >= 0.3)
    presets.blink = Math.min(left, right) * 0.9
  if (jaw >= 0.2)
    presets.aa = Math.min(0.6, jaw * 0.8)
  return presets
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
    return { name, weight: Math.round(Math.min(reactionMaxWeight, face.scale * reactionGain) * 1000) / 1000, key }
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
