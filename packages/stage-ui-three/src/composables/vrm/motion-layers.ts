import type { VRMHumanBoneName } from '@pixiv/three-vrm'
import type { AnimationClip } from 'three'

import { AnimationUtils } from 'three'

/**
 * Body layer of an emote (V6, Plan 01 P3).
 *
 * - `full`: the whole body. The idle stops while the emote plays.
 * - `arms`: shoulders, arms, and hands. The idle keeps the rest of the body.
 * - `upper`: the arms, the torso above the hips, and the head.
 * - `head`: the neck and the head.
 */
export type EmoteLayer = 'full' | 'arms' | 'upper' | 'head'

export interface EmoteLayering {
  layer: EmoteLayer
  /** The clip adds its motion to the current pose, so it never stops the idle or the speech. */
  additive: boolean
}

const fingerBones = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'].flatMap(finger =>
  ['Metacarpal', 'Proximal', 'Intermediate', 'Distal'].map(part => `${finger}${part}`))

const armBones: VRMHumanBoneName[] = (['left', 'right'] as const).flatMap(side => [
  `${side}Shoulder`,
  `${side}UpperArm`,
  `${side}LowerArm`,
  `${side}Hand`,
  ...fingerBones.map(part => `${side}${part}`),
] as VRMHumanBoneName[])

const headBones: VRMHumanBoneName[] = ['neck', 'head', 'leftEye', 'rightEye', 'jaw']

/** Humanoid bones of each layer. `full` has no list: it keeps every track. */
export const emoteLayerBones: Record<Exclude<EmoteLayer, 'full'>, readonly VRMHumanBoneName[]> = {
  arms: armBones,
  head: headBones,
  upper: [...armBones, ...headBones, 'spine', 'chest', 'upperChest'],
}

const headMotion = /\b(?:nod|nodding|shake|shaking)\b|head[_ ]?(?:nod|shake)|acen(?:ar|o) com a cabe[cç]a|balan[cç]ar a cabe[cç]a/i
const armMotion = /wave|hello|point|peace|thumb|clap|shoot|salute|aceno|acenar|apont|tchau|joinha/i
const upperMotion = /shrug|talk|thinking|arms[_ ]?open|explain|ombro/i

/**
 * The layer of an emote, from its name and description.
 *
 * A head nod or shake is additive on the head, so it plays over the idle and the speech.
 * A wave or a point uses the arms only. A shrug or a talking gesture uses the upper body.
 * Any other emote, for example a dance, a bow, or a spin, uses the full body.
 */
export function inferEmoteLayering(emote: { name: string, description?: string }): EmoteLayering {
  const text = `${emote.name} ${emote.description ?? ''}`
  if (headMotion.test(text))
    return { layer: 'head', additive: true }
  if (armMotion.test(text))
    return { layer: 'arms', additive: false }
  if (upperMotion.test(text))
    return { layer: 'upper', additive: false }
  return { layer: 'full', additive: false }
}

/** The node of a track, for example `J_Bip_C_Head` in `J_Bip_C_Head.quaternion`. */
function trackNode(trackName: string) {
  return trackName.slice(0, trackName.lastIndexOf('.'))
}

const maskCache = new WeakMap<AnimationClip, Map<string, AnimationClip>>()

/**
 * A copy of `clip` with only the tracks of `nodes` (`keep`), or without them (`drop`).
 *
 * The same clip, nodes, and mode give the same copy, so the mixer reuses one action for it.
 */
export function maskClip(clip: AnimationClip, nodes: ReadonlySet<string>, mode: 'keep' | 'drop'): AnimationClip {
  const key = `${mode}:${[...nodes].sort().join(',')}`
  let byKey = maskCache.get(clip)
  if (!byKey) {
    byKey = new Map()
    maskCache.set(clip, byKey)
  }
  const cached = byKey.get(key)
  if (cached)
    return cached
  const masked = clip.clone()
  masked.name = `${clip.name}:${mode}`
  masked.tracks = masked.tracks.filter(track => nodes.has(trackNode(track.name)) === (mode === 'keep'))
  byKey.set(key, masked)
  return masked
}

const additiveCache = new WeakMap<AnimationClip, AnimationClip>()

/** An additive copy of `clip`: each frame is a difference from its first frame. */
export function additiveClip(clip: AnimationClip): AnimationClip {
  const cached = additiveCache.get(clip)
  if (cached)
    return cached
  const additive = AnimationUtils.makeClipAdditive(clip.clone(), 0)
  additive.name = `${clip.name}:additive`
  additiveCache.set(clip, additive)
  return additive
}
