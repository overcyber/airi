import type { VRM } from '@pixiv/three-vrm'
import type { CustomMotion } from '@proj-airi/alice-motion'

import { Object3D } from 'three'
import { describe, expect, it } from 'vitest'

import { createCustomMotionClip } from './custom-motion-clip'

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
          scene.add(node)
          nodes.set(bone, node)
        }
        return node
      },
      getRawBoneNode: () => null,
    },
  } as unknown as VRM
}

function motion(kind: 'pose' | 'gesture', bones: CustomMotion['keyframes'][number]['bones'], mirror = false): CustomMotion {
  return { name: 'teste', kind, format: 'bones', duration: 3, mirror, keyframes: [{ t: 0, bones, face: {} }], props: {} }
}

const trackNames = (clip: ReturnType<typeof createCustomMotionClip>) => clip?.tracks.map(track => track.name).sort()

describe('createCustomMotionClip', () => {
  it('keeps the arm that a pose leaves out down at the side', () => {
    const clip = createCustomMotionClip(fakeVrm(), motion('pose', { rightUpperArm: { levantar: 90 } }))
    expect(trackNames(clip)).toEqual(['Normalized_leftUpperArm.quaternion', 'Normalized_rightUpperArm.quaternion'])
  })

  it('does not add an arm that the pose already moves', () => {
    const clip = createCustomMotionClip(fakeVrm(), motion('pose', { leftUpperArm: { levantar: 90 }, rightUpperArm: { levantar: 90 } }))
    expect(clip?.tracks).toHaveLength(2)
  })

  it('follows the mirror when it looks for the arm that is left out', () => {
    // Mirrored, the right arm of the motion plays on the left arm, so the right arm is the one that stays down.
    const clip = createCustomMotionClip(fakeVrm(), motion('pose', { rightUpperArm: { levantar: 90 } }, true))
    expect(trackNames(clip)).toEqual(['Normalized_leftUpperArm.quaternion', 'Normalized_rightUpperArm.quaternion'])
  })

  it('does not touch a gesture, which plays over the idle', () => {
    const clip = createCustomMotionClip(fakeVrm(), motion('gesture', { rightUpperArm: { levantar: 90 } }))
    expect(trackNames(clip)).toEqual(['Normalized_rightUpperArm.quaternion'])
  })
})
