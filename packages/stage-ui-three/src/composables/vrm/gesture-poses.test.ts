import type { VRM } from '@pixiv/three-vrm'

import { Object3D } from 'three'
import { describe, expect, it } from 'vitest'

import { createGestureClip, isProceduralGesture, proceduralGestureNames } from './gesture-poses'

/** A VRM 0.x stand-in whose normalized bones are plain nodes named after the bone. */
function fakeVrm(): VRM {
  const nodes = new Map<string, Object3D>()
  return {
    meta: { metaVersion: '0' },
    humanoid: {
      getNormalizedBoneNode: (bone: string) => {
        let node = nodes.get(bone)
        if (!node) {
          node = new Object3D()
          node.name = `Normalized_${bone}`
          nodes.set(bone, node)
        }
        return node
      },
    },
  } as unknown as VRM
}

describe('createGestureClip', () => {
  it('draws the TalkingHead gestures that NeoAlice sends on the arm bones only', () => {
    const clip = createGestureClip(fakeVrm(), 'handup', 3)!
    expect(clip.duration).toBe(3)
    expect(clip.tracks.map(track => track.name)).toContain('Normalized_rightUpperArm.quaternion')
    expect(clip.tracks.some(track => /hips|spine/i.test(track.name))).toBe(false)
  })

  it('moves the forearm back and forth for a wave', () => {
    const clip = createGestureClip(fakeVrm(), 'wave', 2)!
    const forearm = clip.tracks.find(track => track.name === 'Normalized_rightLowerArm.quaternion')!
    expect(forearm.times.length).toBeGreaterThan(4)
  })

  it('knows every catalog gesture and the stances, and nothing else', () => {
    for (const name of ['handup', 'index', 'ok', 'thumbup', 'thumbdown', 'side', 'shrug', 'namaste', 'wave', 'pose/straight', 'pose/hip'])
      expect(isProceduralGesture(name)).toBe(true)
    expect(proceduralGestureNames).toContain('pose/hip')
    expect(isProceduralGesture('moonwalk')).toBe(false)
    expect(createGestureClip(fakeVrm(), 'moonwalk')).toBeUndefined()
    expect(createGestureClip(fakeVrm(), 'pose/straight')!.tracks).toEqual([])
  })
})
