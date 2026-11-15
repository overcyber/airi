import type { CustomMotion } from '@proj-airi/alice-motion'

import { rigBone } from '@proj-airi/alice-motion'

/**
 * The gestures of speech: small and large movements of the hands, the arms, and the head that a person makes while
 * she talks. Each one is a {@link CustomMotion} in the bone format, built from the axes of the avatar rig, so
 * the same checks and limits apply as for a motion that an LLM creates.
 *
 * A kind of gesture is a shape: an open palm, a chop, a count with the fingers, a shrug. Each time it is built, it
 * takes a hand, an amplitude, a tempo, and a small random change of the angles, so the same kind never looks the
 * same twice.
 */

export type BeatKind
  = | 'open_palm' | 'offer' | 'chop' | 'toss' | 'circle' | 'pinch' | 'point' | 'chest' | 'count_one' | 'count_two' | 'count_three'
    | 'both_open' | 'both_down' | 'both_wide' | 'both_together' | 'shrug' | 'dismiss' | 'present' | 'tap'
    | 'head_tilt' | 'head_nod' | 'lean_in' | 'head_turn' | 'head_toss'

/** What a beat says, to pick it from the text. */
export type BeatRole = 'neutral' | 'emphasis' | 'question' | 'negation' | 'self' | 'you' | 'count' | 'point' | 'uncertain' | 'wide' | 'small' | 'continue' | 'calm' | 'list'

export interface BeatInfo {
  kind: BeatKind
  /** Uses both hands. Then `side` only mirrors the small differences. */
  both: boolean
  /** Moves only the head and the spine, so it fits when the hands rest. */
  headOnly: boolean
  /** The roles that it fits. The picker weights a kind higher when the text has one of them. */
  roles: readonly BeatRole[]
  /** Length in seconds before the tempo. */
  seconds: number
}

export const beatInfo: readonly BeatInfo[] = [
  { kind: 'open_palm', both: false, headOnly: false, roles: ['neutral', 'continue', 'you'], seconds: 1.5 },
  { kind: 'offer', both: false, headOnly: false, roles: ['you', 'question', 'neutral'], seconds: 1.6 },
  { kind: 'chop', both: false, headOnly: false, roles: ['emphasis', 'negation'], seconds: 1.1 },
  { kind: 'toss', both: false, headOnly: false, roles: ['continue', 'neutral', 'uncertain'], seconds: 1.2 },
  { kind: 'circle', both: false, headOnly: false, roles: ['continue', 'list', 'neutral'], seconds: 1.8 },
  { kind: 'pinch', both: false, headOnly: false, roles: ['small', 'calm'], seconds: 1.5 },
  { kind: 'point', both: false, headOnly: false, roles: ['point', 'emphasis'], seconds: 1.4 },
  { kind: 'chest', both: false, headOnly: false, roles: ['self'], seconds: 1.6 },
  { kind: 'count_one', both: false, headOnly: false, roles: ['count', 'list'], seconds: 1.5 },
  { kind: 'count_two', both: false, headOnly: false, roles: ['count', 'list'], seconds: 1.5 },
  { kind: 'count_three', both: false, headOnly: false, roles: ['count', 'list'], seconds: 1.6 },
  { kind: 'both_open', both: true, headOnly: false, roles: ['neutral', 'you', 'wide'], seconds: 1.8 },
  { kind: 'both_down', both: true, headOnly: false, roles: ['calm', 'emphasis', 'negation'], seconds: 1.5 },
  { kind: 'both_wide', both: true, headOnly: false, roles: ['wide', 'emphasis'], seconds: 1.9 },
  { kind: 'both_together', both: true, headOnly: false, roles: ['calm', 'small', 'self'], seconds: 1.8 },
  { kind: 'shrug', both: true, headOnly: false, roles: ['uncertain', 'question'], seconds: 1.7 },
  { kind: 'dismiss', both: false, headOnly: false, roles: ['negation', 'uncertain'], seconds: 1.2 },
  { kind: 'present', both: false, headOnly: false, roles: ['point', 'you', 'wide'], seconds: 1.6 },
  { kind: 'tap', both: false, headOnly: false, roles: ['list', 'emphasis'], seconds: 1.3 },
  { kind: 'head_tilt', both: false, headOnly: true, roles: ['question', 'uncertain', 'calm', 'neutral'], seconds: 1.4 },
  { kind: 'head_nod', both: false, headOnly: true, roles: ['emphasis', 'neutral', 'continue'], seconds: 1.0 },
  { kind: 'lean_in', both: false, headOnly: true, roles: ['self', 'small', 'question', 'you'], seconds: 1.6 },
  { kind: 'head_turn', both: false, headOnly: true, roles: ['neutral', 'uncertain', 'point'], seconds: 1.5 },
  { kind: 'head_toss', both: false, headOnly: true, roles: ['emphasis', 'continue', 'list'], seconds: 1.1 },
]

export const beatKinds: readonly BeatKind[] = beatInfo.map(info => info.kind)

export interface BeatOptions {
  /** The hand of a one-hand beat. A two-hand beat ignores it. */
  side: 'left' | 'right'
  /** How large the movement is. 1 is the usual size. 0.6 to 1.4. */
  amplitude: number
  /** How fast. 1 is the usual pace. Above 1 is faster. */
  tempo: number
  /** The source of the small random changes. Between 0 and 1. */
  random: () => number
}

type Side = 'left' | 'right'
type Bones = Record<string, Record<string, number>>
interface Frame { at: number, bones: Bones, face?: Record<string, number> }

/** The arm at rest, in the idle: a little away from the body. */
const restRaise = 8
const restBend = 8
/** The elbow opens a little in every beat, so the hands stay at the chest and not at the chin. */
const elbowEase = 0.86

type Hand = 'relaxed' | 'open' | 'point' | 'fist' | 'pinch' | 'count1' | 'count2' | 'count3' | 'cupped' | 'flat'

/** Finger closing of each shape: thumb, index, middle, ring, little. Degrees of the proximal joint. */
const handShapes: Record<Hand, readonly [number, number, number, number, number]> = {
  relaxed: [12, 18, 22, 26, 30],
  open: [0, 3, 3, 4, 6],
  flat: [0, 0, 0, 0, 0],
  point: [35, 0, 80, 85, 88],
  fist: [45, 85, 88, 88, 88],
  pinch: [40, 40, 25, 30, 35],
  count1: [40, 0, 82, 86, 88],
  count2: [40, 0, 0, 86, 88],
  count3: [40, 0, 0, 0, 88],
  cupped: [20, 30, 32, 36, 40],
}

const fingerNames = ['Index', 'Middle', 'Ring', 'Little'] as const

/** The finger bones of one hand for a shape. The next joints close a little more than the first one. */
function fingers(side: Side, shape: Hand): Bones {
  const [thumb, ...others] = handShapes[shape]
  const bones: Bones = {
    [`${side}ThumbMetacarpal`]: { fechar: thumb * 0.5 },
    [`${side}ThumbProximal`]: { fechar: thumb * 0.6 },
  }
  fingerNames.forEach((name, index) => {
    const close = others[index]
    bones[`${side}${name}Proximal`] = { fechar: close }
    bones[`${side}${name}Intermediate`] = { fechar: Math.min(100, close * 1.05) }
    bones[`${side}${name}Distal`] = { fechar: Math.min(80, close * 0.7) }
  })
  return bones
}

interface ArmPose {
  /** The arm: raise from down, direction (0 side, 90 front), and twist. */
  arm: readonly [raise: number, front: number, twist?: number]
  /** The elbow: bend, and twist of the forearm (positive turns the palm up). */
  elbow: readonly [bend: number, twist?: number]
  /** The wrist: bend, and sideways. */
  wrist?: readonly [bend: number, sideways?: number]
  hand?: Hand
  shoulder?: readonly [raise: number, front?: number]
}

/** The bones of one arm for a pose, with the size of the movement scaled from the rest. */
function arm(side: Side, pose: ArmPose, amplitude: number, jitter: () => number): Bones {
  const scale = (value: number, rest: number) => rest + (value - rest) * amplitude
  const wobble = (value: number, size: number) => value + (jitter() - 0.5) * 2 * size
  const [raise, front, twist = 0] = pose.arm
  const [bend, forearmTwist = 0] = pose.elbow
  const bones: Bones = {
    [`${side}UpperArm`]: { levantar: wobble(scale(raise, restRaise), 4), frente: wobble(front * amplitude + 10 * (1 - amplitude), 5), torcer: wobble(twist, 6) },
    [`${side}LowerArm`]: { dobrar: wobble(scale(bend * elbowEase, restBend), 5), torcer: wobble(forearmTwist, 6) },
  }
  if (pose.wrist)
    bones[`${side}Hand`] = { dobrar: wobble(pose.wrist[0], 5), desviar: wobble(pose.wrist[1] ?? 0, 4) }
  if (pose.shoulder)
    bones[`${side}Shoulder`] = { levantar: pose.shoulder[0], frente: pose.shoulder[1] ?? 0 }
  return { ...bones, ...fingers(side, pose.hand ?? 'relaxed') }
}

function merge(...parts: Bones[]): Bones {
  const result: Bones = {}
  for (const part of parts) {
    for (const [bone, axes] of Object.entries(part))
      result[bone] = { ...result[bone], ...axes }
  }
  return result
}

/** Her left side is the left of the avatar. A turn toward the other hand is a positive or negative turn by side. */
const turnToward = (side: Side) => side === 'right' ? -1 : 1

/** The keys of one kind, as fractions of its length from 0 to 1. The first and the last key are near the rest. */
function frames(kind: BeatKind, side: Side, amplitude: number, random: () => number): Frame[] {
  const a = (pose: ArmPose, s: Side = side) => arm(s, pose, amplitude, random)
  const rest = (): ArmPose => ({ arm: [restRaise, 0], elbow: [restBend], hand: 'relaxed' })
  const sign = turnToward(side)
  switch (kind) {
    case 'open_palm':
      return [
        { at: 0, bones: a(rest()) },
        { at: 0.28, bones: a({ arm: [34, 62, 10], elbow: [88, 35], wrist: [-8], hand: 'open' }) },
        { at: 0.45, bones: a({ arm: [40, 70, 10], elbow: [80, 50], wrist: [-14], hand: 'open' }) },
        { at: 0.68, bones: a({ arm: [38, 66, 8], elbow: [84, 42], wrist: [-10], hand: 'relaxed' }) },
        { at: 1, bones: a(rest()) },
      ]
    case 'offer':
      return [
        { at: 0, bones: a(rest()) },
        { at: 0.3, bones: a({ arm: [42, 88, 15], elbow: [55, 62], wrist: [-10], hand: 'flat' }) },
        { at: 0.6, bones: a({ arm: [46, 92, 15], elbow: [40, 70], wrist: [-14], hand: 'flat' }) },
        { at: 1, bones: a(rest()) },
      ]
    case 'chop':
      return [
        { at: 0, bones: a(rest()) },
        { at: 0.3, bones: a({ arm: [58, 78], elbow: [78, 0], wrist: [0], hand: 'flat' }) },
        { at: 0.46, bones: a({ arm: [34, 84], elbow: [64, 0], wrist: [8], hand: 'flat' }) },
        { at: 0.7, bones: a({ arm: [38, 80], elbow: [70, 0], wrist: [4], hand: 'relaxed' }) },
        { at: 1, bones: a(rest()) },
      ]
    case 'toss':
      return [
        { at: 0, bones: a(rest()) },
        { at: 0.3, bones: a({ arm: [38, 55], elbow: [95, 20], wrist: [-20, -8], hand: 'relaxed' }) },
        { at: 0.5, bones: a({ arm: [46, 38], elbow: [60, 40], wrist: [10, 12], hand: 'open' }) },
        { at: 0.75, bones: a({ arm: [34, 40], elbow: [60, 30], wrist: [4, 6], hand: 'relaxed' }) },
        { at: 1, bones: a(rest()) },
      ]
    case 'circle':
      return [
        { at: 0, bones: a(rest()) },
        { at: 0.2, bones: a({ arm: [36, 66], elbow: [90, 30], wrist: [0], hand: 'cupped' }) },
        { at: 0.4, bones: a({ arm: [44, 76], elbow: [80, 30], wrist: [-6], hand: 'cupped' }) },
        { at: 0.6, bones: a({ arm: [40, 84], elbow: [86, 30], wrist: [4], hand: 'cupped' }) },
        { at: 0.8, bones: a({ arm: [32, 74], elbow: [94, 30], wrist: [-4], hand: 'cupped' }) },
        { at: 1, bones: a(rest()) },
      ]
    case 'pinch':
      return [
        { at: 0, bones: a(rest()) },
        { at: 0.32, bones: a({ arm: [30, 78], elbow: [102, 10], wrist: [-4], hand: 'pinch' }) },
        { at: 0.6, bones: a({ arm: [32, 80], elbow: [98, 10], wrist: [0], hand: 'pinch' }) },
        { at: 1, bones: a(rest()) },
      ]
    case 'point':
      return [
        { at: 0, bones: a(rest()) },
        { at: 0.3, bones: a({ arm: [62, 84], elbow: [30, 0], wrist: [0], hand: 'point' }) },
        { at: 0.62, bones: a({ arm: [66, 86], elbow: [22, 0], wrist: [4], hand: 'point' }) },
        { at: 1, bones: a(rest()) },
      ]
    case 'chest':
      return [
        { at: 0, bones: a(rest()) },
        { at: 0.35, bones: a({ arm: [22, 104], elbow: [128, -30], wrist: [10], hand: 'relaxed' }) },
        { at: 0.7, bones: a({ arm: [22, 106], elbow: [130, -30], wrist: [12], hand: 'relaxed' }) },
        { at: 1, bones: a(rest()) },
      ]
    case 'count_one':
    case 'count_two':
    case 'count_three': {
      const shape = kind === 'count_one' ? 'count1' : kind === 'count_two' ? 'count2' : 'count3'
      return [
        { at: 0, bones: a(rest()) },
        { at: 0.3, bones: a({ arm: [30, 72], elbow: [100, 5], wrist: [-4], hand: 'relaxed' }) },
        { at: 0.45, bones: a({ arm: [34, 76], elbow: [96, 5], wrist: [-6], hand: shape }) },
        { at: 0.75, bones: a({ arm: [34, 76], elbow: [96, 5], wrist: [-6], hand: shape }) },
        { at: 1, bones: a(rest()) },
      ]
    }
    case 'both_open':
      return [
        { at: 0, bones: merge(a(rest(), 'left'), a(rest(), 'right')) },
        { at: 0.3, bones: merge(a({ arm: [34, 60, 8], elbow: [86, 32], wrist: [-8], hand: 'open' }, 'left'), a({ arm: [34, 60, 8], elbow: [86, 32], wrist: [-8], hand: 'open' }, 'right')) },
        { at: 0.5, bones: merge(a({ arm: [44, 52, 8], elbow: [74, 40], wrist: [-12], hand: 'open' }, 'left'), a({ arm: [44, 52, 8], elbow: [74, 40], wrist: [-12], hand: 'open' }, 'right')) },
        { at: 0.75, bones: merge(a({ arm: [38, 58, 8], elbow: [80, 34], wrist: [-8], hand: 'relaxed' }, 'left'), a({ arm: [38, 58, 8], elbow: [80, 34], wrist: [-8], hand: 'relaxed' }, 'right')) },
        { at: 1, bones: merge(a(rest(), 'left'), a(rest(), 'right')) },
      ]
    case 'both_down':
      return [
        { at: 0, bones: merge(a(rest(), 'left'), a(rest(), 'right')) },
        { at: 0.3, bones: merge(a({ arm: [40, 78, -10], elbow: [70, -50], wrist: [-6], hand: 'flat' }, 'left'), a({ arm: [40, 78, -10], elbow: [70, -50], wrist: [-6], hand: 'flat' }, 'right')) },
        { at: 0.5, bones: merge(a({ arm: [30, 80, -10], elbow: [58, -52], wrist: [6], hand: 'flat' }, 'left'), a({ arm: [30, 80, -10], elbow: [58, -52], wrist: [6], hand: 'flat' }, 'right')) },
        { at: 0.75, bones: merge(a({ arm: [30, 80, -10], elbow: [60, -50], wrist: [4], hand: 'relaxed' }, 'left'), a({ arm: [30, 80, -10], elbow: [60, -50], wrist: [4], hand: 'relaxed' }, 'right')) },
        { at: 1, bones: merge(a(rest(), 'left'), a(rest(), 'right')) },
      ]
    case 'both_wide':
      return [
        { at: 0, bones: merge(a(rest(), 'left'), a(rest(), 'right')) },
        { at: 0.35, bones: merge(a({ arm: [58, 28], elbow: [44, 40], wrist: [-4], hand: 'open' }, 'left'), a({ arm: [58, 28], elbow: [44, 40], wrist: [-4], hand: 'open' }, 'right')) },
        { at: 0.6, bones: merge(a({ arm: [66, 22], elbow: [30, 40], wrist: [-4], hand: 'open' }, 'left'), a({ arm: [66, 22], elbow: [30, 40], wrist: [-4], hand: 'open' }, 'right')) },
        { at: 0.85, bones: merge(a({ arm: [50, 34], elbow: [50, 30], wrist: [0], hand: 'relaxed' }, 'left'), a({ arm: [50, 34], elbow: [50, 30], wrist: [0], hand: 'relaxed' }, 'right')) },
        { at: 1, bones: merge(a(rest(), 'left'), a(rest(), 'right')) },
      ]
    case 'both_together':
      return [
        { at: 0, bones: merge(a(rest(), 'left'), a(rest(), 'right')) },
        { at: 0.4, bones: merge(a({ arm: [24, 82], elbow: [112, 10], wrist: [0, 8], hand: 'relaxed' }, 'left'), a({ arm: [24, 82], elbow: [112, 10], wrist: [0, 8], hand: 'relaxed' }, 'right')) },
        { at: 0.7, bones: merge(a({ arm: [26, 86], elbow: [108, 10], wrist: [2, 8], hand: 'relaxed' }, 'left'), a({ arm: [26, 86], elbow: [108, 10], wrist: [2, 8], hand: 'relaxed' }, 'right')) },
        { at: 1, bones: merge(a(rest(), 'left'), a(rest(), 'right')) },
      ]
    case 'shrug':
      return [
        { at: 0, bones: merge(a(rest(), 'left'), a(rest(), 'right')) },
        { at: 0.32, bones: merge(a({ arm: [30, 58, 12], elbow: [92, 40], wrist: [-6], hand: 'open', shoulder: [16] }, 'left'), a({ arm: [30, 58, 12], elbow: [92, 40], wrist: [-6], hand: 'open', shoulder: [16] }, 'right'), { head: { lado: 8 * sign, frente: 4 } }) },
        { at: 0.62, bones: merge(a({ arm: [32, 60, 12], elbow: [90, 40], wrist: [-8], hand: 'open', shoulder: [12] }, 'left'), a({ arm: [32, 60, 12], elbow: [90, 40], wrist: [-8], hand: 'open', shoulder: [12] }, 'right'), { head: { lado: 8 * sign, frente: 4 } }) },
        { at: 1, bones: merge(a(rest(), 'left'), a(rest(), 'right'), { head: { lado: 0, frente: 0 } }) },
      ]
    case 'dismiss':
      return [
        { at: 0, bones: a(rest()) },
        { at: 0.3, bones: a({ arm: [36, 52, 0], elbow: [80, -40], wrist: [-4, 6], hand: 'relaxed' }) },
        { at: 0.48, bones: a({ arm: [38, 36, 0], elbow: [66, -40], wrist: [8, -10], hand: 'open' }) },
        { at: 0.7, bones: a({ arm: [34, 40, 0], elbow: [72, -40], wrist: [2, -4], hand: 'relaxed' }) },
        { at: 1, bones: a(rest()) },
      ]
    case 'present':
      return [
        { at: 0, bones: a(rest()) },
        { at: 0.3, bones: a({ arm: [52, 48, 10], elbow: [54, 50], wrist: [-8], hand: 'flat' }) },
        { at: 0.58, bones: a({ arm: [56, 34, 10], elbow: [34, 52], wrist: [-8], hand: 'flat' }) },
        { at: 1, bones: a(rest()) },
      ]
    case 'tap':
      return [
        { at: 0, bones: a(rest()) },
        { at: 0.25, bones: a({ arm: [46, 76], elbow: [88, 10], wrist: [-4], hand: 'point' }) },
        { at: 0.38, bones: a({ arm: [44, 78], elbow: [96, 10], wrist: [10], hand: 'point' }) },
        { at: 0.5, bones: a({ arm: [46, 76], elbow: [88, 10], wrist: [-4], hand: 'point' }) },
        { at: 0.62, bones: a({ arm: [44, 78], elbow: [96, 10], wrist: [10], hand: 'point' }) },
        { at: 0.8, bones: a({ arm: [38, 76], elbow: [90, 10], wrist: [0], hand: 'relaxed' }) },
        { at: 1, bones: a(rest()) },
      ]
    case 'head_tilt':
      return [
        { at: 0, bones: { head: { lado: 0, frente: 0 }, neck: { lado: 0 } } },
        { at: 0.35, bones: { head: { lado: 11 * sign, frente: 2 }, neck: { lado: 5 * sign } } },
        { at: 0.75, bones: { head: { lado: 10 * sign, frente: 3 }, neck: { lado: 4 * sign } } },
        { at: 1, bones: { head: { lado: 0, frente: 0 }, neck: { lado: 0 } } },
      ]
    case 'head_nod':
      return [
        { at: 0, bones: { head: { frente: 0 } } },
        { at: 0.22, bones: { head: { frente: 9 } } },
        { at: 0.42, bones: { head: { frente: -2 } } },
        { at: 0.62, bones: { head: { frente: 7 } } },
        { at: 1, bones: { head: { frente: 0 } } },
      ]
    case 'lean_in':
      return [
        { at: 0, bones: { spine: { frente: 0 }, chest: { frente: 0 }, head: { frente: 0 } } },
        { at: 0.4, bones: { spine: { frente: 6 }, chest: { frente: 4 }, head: { frente: -3, lado: 4 * sign } } },
        { at: 0.75, bones: { spine: { frente: 5 }, chest: { frente: 3 }, head: { frente: -2, lado: 3 * sign } } },
        { at: 1, bones: { spine: { frente: 0 }, chest: { frente: 0 }, head: { frente: 0, lado: 0 } } },
      ]
    case 'head_turn':
      return [
        { at: 0, bones: { head: { girar: 0 }, neck: { girar: 0 } } },
        { at: 0.35, bones: { head: { girar: 14 * sign, frente: -2 }, neck: { girar: 8 * sign } } },
        { at: 0.7, bones: { head: { girar: 12 * sign }, neck: { girar: 6 * sign } } },
        { at: 1, bones: { head: { girar: 0, frente: 0 }, neck: { girar: 0 } } },
      ]
    case 'head_toss':
      return [
        { at: 0, bones: { head: { frente: 0, lado: 0 } } },
        { at: 0.25, bones: { head: { frente: -7, lado: 6 * sign } } },
        { at: 0.5, bones: { head: { frente: 4, lado: -3 * sign } } },
        { at: 1, bones: { head: { frente: 0, lado: 0 } } },
      ]
  }
}

/** Keeps each axis inside the human limits of the rig, so a large amplitude never bends a joint too far. */
function withinLimits(bones: Bones): Bones {
  const result: Bones = {}
  for (const [bone, axes] of Object.entries(bones)) {
    const limits = rigBone(bone)?.axes
    result[bone] = {}
    for (const [axis, value] of Object.entries(axes)) {
      const limit = limits?.[axis]
      result[bone][axis] = limit ? Math.min(limit.max, Math.max(limit.min, value)) : value
    }
  }
  return result
}

/** The beat of one kind, ready to play on the avatar. Every call changes the angles and the timing a little. */
export function buildBeat(kind: BeatKind, options: BeatOptions): CustomMotion {
  const info = beatInfo.find(item => item.kind === kind)!
  const amplitude = Math.min(1.4, Math.max(0.6, options.amplitude))
  const tempo = Math.min(1.5, Math.max(0.7, options.tempo))
  const duration = Math.min(60, Math.max(0.5, (info.seconds / tempo) * (0.92 + options.random() * 0.16)))
  const keyframes = frames(kind, options.side, amplitude, options.random).map(frame => ({
    t: Math.round(frame.at * duration * 1000) / 1000,
    bones: withinLimits(frame.bones),
    face: frame.face ?? {},
  }))
  return {
    name: `speech_${kind}`,
    kind: 'gesture',
    format: 'bones',
    duration,
    mirror: false,
    keyframes,
    props: {},
  }
}
