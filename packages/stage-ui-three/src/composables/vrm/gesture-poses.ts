import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'

import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack } from 'three'

import { proceduralAxisSign } from './procedural-axes'

type Rotation = [number, number, number]
type Pose = Partial<Record<VRMHumanBoneName, Rotation>>

/**
 * Hand gestures and stances of the TalkingHead avatar, which NeoAlice sends as `cmd/avatar/gesture`
 * and `cmd/avatar/pose`. TalkingHead draws them by code, so the VRM draws them by code too.
 *
 * Normalized humanoid space, T-pose rest, Euler XYZ in radians, for the right side of a VRM 0.x.
 * The left side mirrors y and z. A VRM 1.0 gets x and z flipped, see `proceduralAxisSign`.
 */
const curledFingers: Pose = {
  rightIndexProximal: [0, 0, -1.2],
  rightIndexIntermediate: [0, 0, -1.3],
  rightMiddleProximal: [0, 0, -1.2],
  rightMiddleIntermediate: [0, 0, -1.3],
  rightRingProximal: [0, 0, -1.2],
  rightRingIntermediate: [0, 0, -1.3],
  rightLittleProximal: [0, 0, -1.2],
  rightLittleIntermediate: [0, 0, -1.3],
}

const rightGestures: Record<string, Pose> = {
  handup: { rightUpperArm: [0, 0.2, 1.25], rightLowerArm: [0, 0.3, 0.2], rightHand: [0, 0, 0] },
  index: { rightUpperArm: [0, 1.3, -0.15], rightLowerArm: [0, 0.15, 0], ...curledFingers, rightIndexProximal: [0, 0, 0], rightIndexIntermediate: [0, 0, 0] },
  ok: { rightUpperArm: [0, 0.7, -1.0], rightLowerArm: [0, 1.6, 0], rightIndexProximal: [0, 0, -0.9], rightIndexIntermediate: [0, 0, -1.0], rightThumbProximal: [0, 0.5, 0] },
  thumbup: { rightUpperArm: [0, 0.8, -1.0], rightLowerArm: [0, 1.5, 0], ...curledFingers },
  thumbdown: { rightUpperArm: [0, 0.8, -1.0], rightLowerArm: [0, 0.8, 0], rightHand: [3.1, 0, 0], ...curledFingers },
  side: { rightUpperArm: [0, 0.2, -0.45], rightLowerArm: [0, 0.4, 0], rightHand: [0, 0, 0.3] },
  wave: { rightUpperArm: [0, 0.25, 1.1], rightLowerArm: [0, 0.2, 0.35] },
}

const bothArmGestures: Record<string, Pose> = {
  shrug: {
    rightShoulder: [0, 0, 0.25],
    leftShoulder: [0, 0, -0.25],
    rightUpperArm: [0, 0.3, -1.05],
    leftUpperArm: [0, -0.3, 1.05],
    rightLowerArm: [0, 1.3, 0],
    leftLowerArm: [0, -1.3, 0],
  },
  namaste: {
    rightUpperArm: [0, 0.9, -1.1],
    leftUpperArm: [0, -0.9, 1.1],
    rightLowerArm: [0, 2.0, 0],
    leftLowerArm: [0, -2.0, 0],
  },
}

const stances: Record<string, Pose> = {
  // The idle already stands straight: the stance only needs the arms at rest.
  straight: {},
  hip: {
    rightUpperArm: [0, -0.35, -0.95],
    rightLowerArm: [0, -1.7, 0],
    leftUpperArm: [0, 0.35, 0.95],
    leftLowerArm: [0, 1.7, 0],
  },
}

/** Gestures and stances that {@link createGestureClip} draws. */
export const proceduralGestureNames = [...Object.keys(rightGestures), ...Object.keys(bothArmGestures), ...Object.keys(stances).map(name => `pose/${name}`)]

/** The pose of a gesture or stance name, for example `handup` or `pose/hip`. Unknown names give `undefined`. */
function poseOf(name: string): Pose | undefined {
  if (name.startsWith('pose/'))
    return stances[name.slice('pose/'.length)]
  return rightGestures[name] ?? bothArmGestures[name]
}

/** Tells if {@link createGestureClip} can draw `name`. */
export function isProceduralGesture(name: string): boolean {
  return poseOf(name) !== undefined
}

function quaternionOf([x, y, z]: Rotation, sign: number) {
  return new Quaternion().setFromEuler(new Euler(sign * x, y, sign * z, 'XYZ'))
}

/**
 * A clip that holds a gesture or a stance on its bones for `durationSeconds`. A wave also moves
 * the forearm left and right. The clip has only the gesture bones, so the V6 bone mask plays it over
 * the idle, and the rest of the body keeps breathing.
 *
 * Returns `undefined` for an unknown name, and an empty clip for a stance without bones (`straight`).
 */
export function createGestureClip(vrm: VRM, name: string, durationSeconds = 3): AnimationClip | undefined {
  const pose = poseOf(name)
  if (!pose)
    return undefined
  const sign = proceduralAxisSign(vrm)
  const duration = Math.max(durationSeconds, 0.5)
  const tracks: QuaternionKeyframeTrack[] = []

  for (const [boneName, rotation] of Object.entries(pose) as Array<[VRMHumanBoneName, Rotation]>) {
    const node = vrm.humanoid.getNormalizedBoneNode(boneName)
    if (!node)
      continue
    const q = quaternionOf(rotation, sign)
    tracks.push(new QuaternionKeyframeTrack(`${node.name}.quaternion`, [0, duration], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]))
  }

  if (name === 'wave') {
    const forearm = vrm.humanoid.getNormalizedBoneNode('rightLowerArm')
    if (forearm) {
      const [x, y, z] = pose.rightLowerArm ?? [0, 0, 0]
      const times: number[] = []
      const values: number[] = []
      const steps = Math.max(4, Math.round(duration / 0.35))
      for (let step = 0; step <= steps; step++) {
        const swing = step % 2 === 0 ? 0.35 : -0.35
        const q = quaternionOf([x, y + swing, z], sign)
        times.push(step * duration / steps)
        values.push(q.x, q.y, q.z, q.w)
      }
      const name = `${forearm.name}.quaternion`
      const index = tracks.findIndex(track => track.name === name)
      const track = new QuaternionKeyframeTrack(name, times, values)
      if (index >= 0)
        tracks[index] = track
      else
        tracks.push(track)
    }
  }

  return new AnimationClip(`gesture:${name}`, duration, tracks)
}
