import type { VRM } from '@pixiv/three-vrm'

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { Group, Object3D, Quaternion, Vector3 } from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { describe, expect, it } from 'vitest'

import { retargetFbxClip } from './fbx-retarget'

/** A VRM 1.0 stand-in with normalized nodes and hips 1 m above the root, like the retarget tests. */
function createVrm() {
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
  return { scene, meta: { metaVersion: '1' }, humanoid: { getNormalizedBoneNode: (name: string) => node(name), getRawBoneNode: () => null } } as unknown as VRM
}

function loadBundledFbx(file: string) {
  const buffer = readFileSync(fileURLToPath(new URL(`../../assets/vrm/animations/neoalice/${file}`, import.meta.url)))
  return new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '')
}

function valueAt(values: ArrayLike<number>, times: ArrayLike<number>, seconds: number, size: number) {
  let index = 0
  while (index + 1 < times.length && times[index + 1] <= seconds)
    index++
  return Array.from({ length: size }, (_, i) => values[index * size + i])
}

describe('lie-down.fbx', () => {
  // The clip of `scripts/lie-down.py`: 2.5 s from standing to lying on the right side, then 6 s of breathing.
  const asset = loadBundledFbx('lie-down.fbx')
  const clip = asset.animations[0]
  const result = retargetFbxClip(createVrm(), clip)!

  it('starts standing in the rest pose and ends lying on the floor', () => {
    expect(clip.duration).toBeCloseTo(8.5, 2)
    const hips = result.tracks.find(track => track.name === 'Normalized_hips.position')!
    expect(valueAt(hips.values, hips.times, 0, 3)[1]).toBeCloseTo(1, 2)
    expect(valueAt(hips.values, hips.times, 2.5, 3)[1]).toBeCloseTo(0.14, 2)
    // The spine starts at rest: no rotation on the VRM.
    const spine = result.tracks.find(track => track.name === 'Normalized_spine.quaternion')!
    expect(new Quaternion().fromArray(valueAt(spine.values, spine.times, 0, 4)).angleTo(new Quaternion())).toBeLessThan(0.01)
  })

  it('turns the body on its side, head to her right, with the front toward the viewer', () => {
    const hips = result.tracks.find(track => track.name === 'Normalized_hips.quaternion')!
    const lying = new Quaternion().fromArray(valueAt(hips.values, hips.times, 2.5, 4))
    const up = new Vector3(0, 1, 0).applyQuaternion(lying)
    const front = new Vector3(0, 0, 1).applyQuaternion(lying)
    expect(up.x).toBeLessThan(-0.9)
    expect(front.z).toBeGreaterThan(0.9)
  })

  it('loops: the last frame of the clip is the first frame of the held part', () => {
    const hips = result.tracks.find(track => track.name === 'Normalized_hips.position')!
    expect(valueAt(hips.values, hips.times, 8.5, 3)).toEqual(valueAt(hips.values, hips.times, 2.5, 3).map(value => expect.closeTo(value, 3)))
    const chest = result.tracks.find(track => track.name === 'Normalized_upperChest.quaternion')!
    const first = new Quaternion().fromArray(valueAt(chest.values, chest.times, 2.5, 4))
    const last = new Quaternion().fromArray(valueAt(chest.values, chest.times, 8.5, 4))
    expect(first.angleTo(last)).toBeLessThan(0.01)
  })
})
