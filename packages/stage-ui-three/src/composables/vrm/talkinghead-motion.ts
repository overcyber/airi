import type { VRM } from '@pixiv/three-vrm'
import type { KeyframeTrack } from 'three'

import type { TalkingHeadAxis, TalkingHeadProps } from './talkinghead-templates'

import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three'

import { retargetFbxClip } from './fbx-retarget'
import { talkingHeadGestures, talkingHeadPoses } from './talkinghead-templates'

/** A TalkingHead template that the VRM plays. */
export interface TalkingHeadClipId {
  kind: 'gesture' | 'pose'
  name: string
  /** The gesture moves to the other hand, like TalkingHead `playGesture(name, dur, true)`. */
  mirror: boolean
}

/**
 * Reads a renderer clip id of a TalkingHead template: `th:gesture:wave`, `th:gesture:wave:mirror`, or
 * `th:pose:sitting`. Gives `undefined` for any other id, or for a template that TalkingHead does not have.
 */
export function parseTalkingHeadClipId(id: string): TalkingHeadClipId | undefined {
  const match = /^th:(gesture|pose):([a-z_]+)(:mirror)?$/.exec(id)
  if (!match)
    return undefined
  const kind = match[1] as TalkingHeadClipId['kind']
  const templates = kind === 'gesture' ? talkingHeadGestures : talkingHeadPoses
  if (!Object.hasOwn(templates, match[2]))
    return undefined
  return { kind, name: match[2], mirror: match[3] !== undefined }
}

/** A value of a template axis. TalkingHead picks a random value in a range, so the gesture varies a little. */
function axisValue(axis: TalkingHeadAxis, random: () => number) {
  return typeof axis === 'number' ? axis : axis[0] + (axis[1] - axis[0]) * random()
}

/** Left bones become right bones and the reverse, as in TalkingHead `mirrorPose`. */
function mirrorBone(bone: string) {
  if (bone.startsWith('Left'))
    return `Right${bone.slice(4)}`
  if (bone.startsWith('Right'))
    return `Left${bone.slice(5)}`
  return bone
}

/** One swing of the wave, from one end of the forearm range to the other. */
const waveSwingSeconds = 0.3

/**
 * A VRM clip of a TalkingHead gesture or pose template.
 *
 * The templates are local rotations on the Ready Player Me skeleton, the same data as the FBX animations of the
 * mirror, so the clip goes through the FBX retarget (`retargetFbxClip`). The gesture looks as it does on the
 * TalkingHead avatar. A `wave` also swings the forearm across the range of its template, so the hand waves.
 *
 * Returns `undefined` when no bone of the template maps to the VRM.
 */
export function createTalkingHeadClip(vrm: VRM, id: TalkingHeadClipId, options: { durationSeconds: number, random?: () => number }): AnimationClip | undefined {
  return createTalkingHeadClipFromProps(vrm, (id.kind === 'gesture' ? talkingHeadGestures : talkingHeadPoses)[id.name], id, options)
}

/**
 * A VRM clip of any template in the TalkingHead format, for example one that NeoAlice defines with
 * `defineGesture` or `definePose`. `id` names the clip and says which hand plays it. Same rules as
 * {@link createTalkingHeadClip}: rotations in radians on the Ready Player Me bones, `Hips.position` in meters.
 */
export function createTalkingHeadClipFromProps(vrm: VRM, props: TalkingHeadProps, id: TalkingHeadClipId, options: { durationSeconds: number, random?: () => number }): AnimationClip | undefined {
  const random = options.random ?? Math.random
  const duration = Math.max(0.5, options.durationSeconds)
  const tracks: KeyframeTrack[] = []
  const rotation = new Quaternion()
  const euler = new Euler()

  for (const [key, value] of Object.entries(props)) {
    const [templateBone, property] = key.split('.')
    const bone = id.mirror ? mirrorBone(templateBone) : templateBone
    if (property === 'position') {
      if (templateBone !== 'Hips')
        continue
      const position = [axisValue(value.x, random), axisValue(value.y, random), axisValue(value.z, random)]
      tracks.push(new VectorKeyframeTrack(`${bone}.position`, [0, duration], [...position, ...position]))
      continue
    }
    if (property !== 'rotation')
      continue

    const wave = id.kind === 'gesture' && id.name === 'wave' && templateBone === 'LeftForeArm' && Array.isArray(value.y)
    const samples = wave ? Math.max(2, Math.round(duration / waveSwingSeconds) + 1) : 2
    const times: number[] = []
    const values: number[] = []
    const x = axisValue(value.x, random)
    const z = axisValue(value.z, random)
    const fixedY = axisValue(value.y, random)
    for (let i = 0; i < samples; i++) {
      const range = value.y as readonly [number, number]
      const y = wave ? range[i % 2] : fixedY
      rotation.setFromEuler(euler.set(x, y, z, 'XYZ')).normalize()
      // The mirror image of a rotation on this skeleton, as in TalkingHead `mirrorPose`.
      if (id.mirror) {
        rotation.x *= -1
        rotation.w *= -1
      }
      times.push(samples === 2 ? i * duration : Math.min(duration, i * waveSwingSeconds))
      values.push(rotation.x, rotation.y, rotation.z, rotation.w)
    }
    tracks.push(new QuaternionKeyframeTrack(`${bone}.quaternion`, times, values))
  }

  return retargetFbxClip(vrm, new AnimationClip(`talkinghead:${id.kind}:${id.name}${id.mirror ? ':mirror' : ''}`, duration, tracks)) ?? undefined
}
