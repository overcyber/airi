import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'
import type { CustomMotion, RigJointKind } from '@proj-airi/alice-motion'
import type { KeyframeTrack } from 'three'

import { rigBone } from '@proj-airi/alice-motion'
import { AnimationClip, MathUtils, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three'

import { createTalkingHeadClipFromProps } from './talkinghead-motion'

/**
 * Turns a motion that an LLM created (`CustomMotion` of alice-motion) into a clip on the normalized bones of a VRM.
 *
 * The axes are anatomical, in degrees (`avatar-rig.ts`). The rotations are built for the left side on a VRM 1.0,
 * where the model faces +Z and her left is +X. The right side is the mirror image, and a VRM 0.x turns x and z
 * the other way, as the FBX retarget does.
 */

const deg = MathUtils.degToRad
const xAxis = new Vector3(1, 0, 0)
const yAxis = new Vector3(0, 1, 0)
const zAxis = new Vector3(0, 0, 1)

const about = (axis: Vector3, degrees: number) => new Quaternion().setFromAxisAngle(axis, deg(degrees))

/** The rotation of one bone of the left side or the middle, from its axes. */
function leftRotation(kind: RigJointKind, axes: Record<string, number>): Quaternion {
  const a = (name: string) => axes[name] ?? 0
  switch (kind) {
    case 'hips':
    case 'trunk':
      // Bend forward, then to her right, then turn to her left.
      return about(yAxis, a('girar')).multiply(about(zAxis, a('lado'))).multiply(about(xAxis, a('frente')))
    case 'shoulder':
      return about(yAxis, -a('frente')).multiply(about(zAxis, a('levantar')))
    case 'upperArm': {
      // The rest of the normalized arm points along +X (T pose). `levantar` is the angle from down, `frente` the
      // turn from the side to the front, and `torcer` a turn about the arm itself.
      const up = deg(a('levantar'))
      const front = deg(a('frente'))
      const direction = new Vector3(Math.cos(front) * Math.sin(up), -Math.cos(up), Math.sin(front) * Math.sin(up)).normalize()
      const aim = new Quaternion().setFromUnitVectors(xAxis, direction)
      return new Quaternion().setFromAxisAngle(direction, deg(-a('torcer'))).multiply(aim)
    }
    case 'lowerArm':
      return about(yAxis, -a('dobrar')).multiply(about(xAxis, -a('torcer')))
    case 'hand':
      return about(yAxis, a('desviar')).multiply(about(zAxis, -a('dobrar')))
    case 'finger':
      return about(yAxis, a('abrir')).multiply(about(zAxis, -a('fechar')))
    case 'thumb':
      return about(yAxis, a('fechar')).multiply(about(zAxis, -a('abrir')))
    case 'upperLeg':
      return about(yAxis, a('girar')).multiply(about(zAxis, a('lado'))).multiply(about(xAxis, -a('frente')))
    case 'lowerLeg':
      return about(xAxis, a('dobrar'))
    case 'foot':
      return about(yAxis, a('girar')).multiply(about(xAxis, a('apontar')))
    case 'toes':
      return about(xAxis, a('dobrar'))
  }
}

/** The rotation of a bone of the motion, on its own side, on this VRM. */
export function boneRotation(vrm: Pick<VRM, 'meta'>, bone: string, axes: Record<string, number>): Quaternion | undefined {
  const rig = rigBone(bone)
  if (!rig)
    return undefined
  const rotation = leftRotation(rig.kind, axes)
  // The mirror image of a left rotation, about the plane between her left and her right.
  if (rig.side === 'right') {
    rotation.y *= -1
    rotation.z *= -1
  }
  // A VRM 0.x faces -Z, so its x and z turns go the other way.
  if (vrm.meta?.metaVersion === '0') {
    rotation.x *= -1
    rotation.z *= -1
  }
  return rotation
}

/** Left bones become right bones and the reverse. */
function otherSide(bone: string) {
  if (bone.startsWith('left'))
    return `right${bone.slice(4)}`
  if (bone.startsWith('right'))
    return `left${bone.slice(5)}`
  return bone
}

/** The face of a motion: the strongest value of each shape over its key frames. */
export function customMotionFace(motion: CustomMotion): Record<string, number> {
  const face: Record<string, number> = {}
  for (const frame of motion.keyframes) {
    for (const [shape, weight] of Object.entries(frame.face))
      face[shape] = Math.max(face[shape] ?? 0, weight)
  }
  return face
}

/**
 * A VRM clip of a motion. A pose lasts its duration, a gesture too. `undefined` when no bone of the motion is on
 * the VRM, for example a motion of the face only.
 */
export function createCustomMotionClip(vrm: VRM, motion: CustomMotion): AnimationClip | undefined {
  const name = `custom:${motion.kind}:${motion.name ?? 'once'}${motion.mirror ? ':mirror' : ''}`
  if (motion.format === 'talkinghead')
    return createTalkingHeadClipFromProps(vrm, motion.props, { kind: motion.kind, name: motion.name ?? 'once', mirror: motion.mirror }, { durationSeconds: motion.duration })

  const duration = motion.duration
  const bones = new Set(motion.keyframes.flatMap(frame => Object.keys(frame.bones)))
  const tracks: KeyframeTrack[] = []
  for (const bone of bones) {
    const target = motion.mirror ? otherSide(bone) : bone
    const node = vrm.humanoid.getNormalizedBoneNode(target as VRMHumanBoneName)
    if (!node)
      continue
    // A bone that a key frame leaves out keeps its value of the frame before, so it does not snap to rest.
    const times: number[] = []
    const values: number[] = []
    let current: Record<string, number> = {}
    for (const frame of motion.keyframes) {
      current = { ...current, ...frame.bones[bone] }
      const rotation = boneRotation(vrm, target, current)!
      times.push(frame.t)
      values.push(rotation.x, rotation.y, rotation.z, rotation.w)
    }
    if (times[times.length - 1] < duration) {
      times.push(duration)
      values.push(...values.slice(-4))
    }
    tracks.push(new QuaternionKeyframeTrack(`${node.name}.quaternion`, times, values))
  }

  // `hips.subir` moves the body up or down, in centimeters from the rest height.
  const hips = vrm.humanoid.getNormalizedBoneNode('hips')
  if (hips && motion.keyframes.some(frame => frame.bones.hips?.subir !== undefined)) {
    const rest = vrm.humanoid.normalizedRestPose?.hips?.position ?? [hips.position.x, hips.position.y, hips.position.z]
    const times: number[] = []
    const values: number[] = []
    let rise = 0
    for (const frame of motion.keyframes) {
      rise = frame.bones.hips?.subir ?? rise
      times.push(frame.t)
      values.push(rest[0], rest[1] + rise / 100, rest[2])
    }
    if (times[times.length - 1] < duration) {
      times.push(duration)
      values.push(...values.slice(-3))
    }
    tracks.push(new VectorKeyframeTrack(`${hips.name}.position`, times, values))
  }
  return tracks.length === 0 ? undefined : new AnimationClip(name, duration, tracks)
}
