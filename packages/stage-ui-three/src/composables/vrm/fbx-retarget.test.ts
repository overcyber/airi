import type { VRM } from '@pixiv/three-vrm'

import { rpmRestSkeleton } from '@proj-airi/alice-motion'
import { AnimationClip, Bone, Group, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three'
import { describe, expect, it } from 'vitest'

import { retargetFbxClip } from './fbx-retarget'

/** A VRM stand-in with normalized nodes named `Normalized_<bone>` and hips 1 m above the root. */
function createVrm(metaVersion: '0' | '1' = '1') {
  const scene = new Group()
  const nodes = new Map<string, Object3D>()
  const node = (name: string) => {
    let found = nodes.get(name)
    if (!found) {
      found = new Object3D()
      found.name = `Normalized_${name}`
      nodes.set(name, found)
      scene.add(found)
    }
    return found
  }
  node('hips').position.y = 1
  scene.updateMatrixWorld(true)
  const vrm = { scene, meta: { metaVersion }, humanoid: { getNormalizedBoneNode: (name: string) => node(name) } } as unknown as VRM
  return vrm
}

function restOf(name: string) {
  return new Quaternion(...rpmRestSkeleton.find(bone => bone.name === name)!.rotation).normalize()
}

function valueOf(clip: AnimationClip, trackName: string) {
  const values = clip.tracks.find(track => track.name === trackName)!.values
  return new Quaternion(values[0], values[1], values[2], values[3])
}

describe('retargetFbxClip', () => {
  it('turns a Ready Player Me rest frame into the A pose of a T pose VRM', () => {
    const clip = new AnimationClip('Scene', 1, ['LeftShoulder', 'LeftArm', 'Spine'].map(name =>
      new QuaternionKeyframeTrack(`${name}.quaternion`, [0], restOf(name).toArray())))

    const result = retargetFbxClip(createVrm(), clip)!

    // The spine has no T pose correction: its rest frame is no rotation.
    expect(valueOf(result, 'Normalized_spine.quaternion').angleTo(new Quaternion())).toBeLessThan(1e-4)
    // The upper arm leaves the T pose (+X) and points down like the A pose of the source.
    const arm = new Vector3(1, 0, 0).applyQuaternion(valueOf(result, 'Normalized_leftUpperArm.quaternion'))
    expect(Math.atan2(-arm.y, arm.x) * 180 / Math.PI).toBeGreaterThan(40)
  })

  it('gives no rotation for the rest frame of a Mixamo T pose skeleton', () => {
    const root = new Group()
    const hips = new Bone()
    hips.name = 'mixamorigHips'
    hips.position.y = 100
    const arm = new Bone()
    arm.name = 'mixamorigLeftArm'
    // A Mixamo T pose arm: the bone +Y axis points along world +X.
    arm.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(1, 0, 0))
    root.add(hips)
    hips.add(arm)
    const clip = new AnimationClip('mixamo.com', 1, [
      new QuaternionKeyframeTrack('mixamorigLeftArm.quaternion', [0], arm.quaternion.toArray()),
      new VectorKeyframeTrack('mixamorigHips.position', [0], [0, 100, 0]),
    ])

    const result = retargetFbxClip(createVrm(), clip, root)!

    expect(valueOf(result, 'Normalized_leftUpperArm.quaternion').angleTo(new Quaternion())).toBeLessThan(1e-4)
    // 100 cm of Mixamo hips become the 1 m hips of the VRM.
    expect(result.tracks.find(track => track.name === 'Normalized_hips.position')!.values[1]).toBeCloseTo(1, 5)
  })

  it('flips x and z for a VRM 0.x, as three-vrm does for VRMA', () => {
    const clip = new AnimationClip('Scene', 1, [new QuaternionKeyframeTrack('LeftArm.quaternion', [0], restOf('LeftArm').toArray())])

    const vrm1 = valueOf(retargetFbxClip(createVrm('1'), clip)!, 'Normalized_leftUpperArm.quaternion')
    const vrm0 = valueOf(retargetFbxClip(createVrm('0'), clip)!, 'Normalized_leftUpperArm.quaternion')

    expect(vrm0.x).toBeCloseTo(-vrm1.x, 6)
    expect(vrm0.y).toBeCloseTo(vrm1.y, 6)
    expect(vrm0.z).toBeCloseTo(-vrm1.z, 6)
  })

  it('scales the hips of a centimeter Ready Player Me clip and drops the other position and scale tracks', () => {
    const clip = new AnimationClip('Scene', 1, [
      new VectorKeyframeTrack('Hips.position', [0], [0, 103.7, 0]),
      new VectorKeyframeTrack('Armature.position', [0], [0, 0, 0]),
      new VectorKeyframeTrack('Spine.scale', [0], [1, 1, 1]),
    ])

    const result = retargetFbxClip(createVrm(), clip)!

    expect(result.tracks.map(track => track.name)).toEqual(['Normalized_hips.position'])
    expect(result.tracks[0].values[1]).toBeCloseTo(1, 3)
  })

  it('returns null when no track maps to a VRM bone, and needs the FBX object for Mixamo', () => {
    expect(retargetFbxClip(createVrm(), new AnimationClip('x', 1, [new QuaternionKeyframeTrack('Tail.quaternion', [0], [0, 0, 0, 1])]))).toBeNull()
    expect(() => retargetFbxClip(createVrm(), new AnimationClip('x', 1, [new QuaternionKeyframeTrack('mixamorigHips.quaternion', [0], [0, 0, 0, 1])]))).toThrow('FBX object')
  })
})
