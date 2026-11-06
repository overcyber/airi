import type { VRM } from '@pixiv/three-vrm'
import type { QuaternionKeyframeTrack } from 'three'

import { Object3D, Quaternion } from 'three'
import { describe, expect, it } from 'vitest'

import { createTalkingHeadClip, parseTalkingHeadClipId } from './talkinghead-motion'

/** A VRM 1.0 stand-in whose normalized bones are plain nodes named after the bone. */
function fakeVrm(): VRM {
  const scene = new Object3D()
  const nodes = new Map<string, Object3D>()
  return {
    meta: { metaVersion: '1' },
    scene,
    humanoid: {
      getNormalizedBoneNode: (bone: string) => {
        let node = nodes.get(bone)
        if (!node) {
          node = new Object3D()
          node.name = `Normalized_${bone}`
          if (bone === 'hips')
            node.position.y = 0.9
          scene.add(node)
          nodes.set(bone, node)
        }
        return node
      },
    },
  } as unknown as VRM
}

const middle = () => 0.5

function rotationOf(track: QuaternionKeyframeTrack, index = 0) {
  return new Quaternion().fromArray(track.values, index * 4)
}

describe('parseTalkingHeadClipId', () => {
  it('reads gestures, mirrored gestures, and poses of TalkingHead, and nothing else', () => {
    expect(parseTalkingHeadClipId('th:gesture:wave:mirror')).toEqual({ kind: 'gesture', name: 'wave', mirror: true })
    expect(parseTalkingHeadClipId('th:pose:arms_open')).toEqual({ kind: 'pose', name: 'arms_open', mirror: false })
    expect(parseTalkingHeadClipId('th:gesture:moonwalk')).toBeUndefined()
    expect(parseTalkingHeadClipId('handup')).toBeUndefined()
  })
})

describe('createTalkingHeadClip', () => {
  it('moves only the bones of a one-hand gesture, on the left hand by default', () => {
    const clip = createTalkingHeadClip(fakeVrm(), { kind: 'gesture', name: 'handup', mirror: false }, { durationSeconds: 3, random: middle })!

    expect(clip.duration).toBe(3)
    const bones = clip.tracks.map(track => track.name.split('.')[0])
    expect(bones).toContain('Normalized_leftUpperArm')
    expect(bones).toContain('Normalized_leftIndexProximal')
    expect(bones.some(bone => bone.includes('right'))).toBe(false)
  })

  it('mirrors a gesture to the other hand as the mirror image of the same pose', () => {
    const vrm = fakeVrm()
    const left = createTalkingHeadClip(vrm, { kind: 'gesture', name: 'thumbup', mirror: false }, { durationSeconds: 2, random: middle })!
    const right = createTalkingHeadClip(vrm, { kind: 'gesture', name: 'thumbup', mirror: true }, { durationSeconds: 2, random: middle })!
    const leftArm = rotationOf(left.tracks.find(track => track.name === 'Normalized_leftUpperArm.quaternion') as QuaternionKeyframeTrack)
    const rightArm = rotationOf(right.tracks.find(track => track.name === 'Normalized_rightUpperArm.quaternion') as QuaternionKeyframeTrack)

    // Normalized VRM space is symmetric in X: the mirror image keeps x and w and negates y and z.
    const mirrored = new Quaternion(leftArm.x, -leftArm.y, -leftArm.z, leftArm.w)
    expect(rightArm.angleTo(mirrored)).toBeLessThan(0.001)
  })

  it('raises the hand in front of the body for handup, not to the side', () => {
    const vrm = fakeVrm()
    const clip = createTalkingHeadClip(vrm, { kind: 'gesture', name: 'handup', mirror: false }, { durationSeconds: 2, random: middle })!
    const upperArm = rotationOf(clip.tracks.find(track => track.name === 'Normalized_leftUpperArm.quaternion') as QuaternionKeyframeTrack)
    // In the T pose the left upper arm points along +X. The gesture turns it down and forward.
    const direction = new Object3D().up.set(1, 0, 0).applyQuaternion(upperArm)
    expect(direction.x).toBeLessThan(0.6)
    expect(direction.z).toBeGreaterThan(0.2)
  })

  it('raises both arms for celebrate, and the hands end above the shoulders', () => {
    const clip = createTalkingHeadClip(fakeVrm(), { kind: 'gesture', name: 'celebrate', mirror: false }, { durationSeconds: 2, random: middle })!
    for (const side of ['left', 'right'] as const) {
      const upper = rotationOf(clip.tracks.find(track => track.name === `Normalized_${side}UpperArm.quaternion`) as QuaternionKeyframeTrack)
      const lower = rotationOf(clip.tracks.find(track => track.name === `Normalized_${side}LowerArm.quaternion`) as QuaternionKeyframeTrack)
      // T pose: the left arm points along +X, the right arm along -X. Chain the forearm on the upper arm.
      const axis = new Object3D().up.set(side === 'left' ? 1 : -1, 0, 0)
      const upperDirection = axis.clone().applyQuaternion(upper)
      const forearmDirection = axis.clone().applyQuaternion(upper.clone().multiply(lower))
      expect(upperDirection.y + forearmDirection.y).toBeGreaterThan(0.5)
    }
  })

  it('swings the forearm for a wave, across the range of the template', () => {
    const clip = createTalkingHeadClip(fakeVrm(), { kind: 'gesture', name: 'wave', mirror: true }, { durationSeconds: 3, random: middle })!
    const forearm = clip.tracks.find(track => track.name === 'Normalized_rightLowerArm.quaternion') as QuaternionKeyframeTrack

    expect(forearm.times.length).toBeGreaterThan(5)
    expect(rotationOf(forearm, 0).angleTo(rotationOf(forearm, 1))).toBeGreaterThan(0.2)
  })

  it('scales the hips by the rest height, also when the body sits now', () => {
    const vrm = fakeVrm()
    ;(vrm.humanoid as unknown as { normalizedRestPose: object }).normalizedRestPose = { hips: { position: [0, 0.9, 0] } }
    vrm.humanoid.getNormalizedBoneNode('hips')!.position.y = 0.1
    const clip = createTalkingHeadClip(vrm, { kind: 'pose', name: 'hip', mirror: false }, { durationSeconds: 1, random: middle })!

    expect(clip.tracks.find(track => track.name === 'Normalized_hips.position')!.values[1]).toBeCloseTo(0.9 / 1.037, 2)
  })

  it('moves the whole body and lowers the hips for the sitting pose', () => {
    const clip = createTalkingHeadClip(fakeVrm(), { kind: 'pose', name: 'sitting', mirror: false }, { durationSeconds: 1, random: middle })!
    const hips = clip.tracks.find(track => track.name === 'Normalized_hips.position')!

    expect(clip.tracks.some(track => track.name === 'Normalized_leftUpperLeg.quaternion')).toBe(true)
    expect(hips.values[1]).toBeLessThan(0.2)
  })
})
