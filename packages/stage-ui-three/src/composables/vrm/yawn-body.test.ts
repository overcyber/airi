import type { VRM } from '@pixiv/three-vrm'

import { Object3D } from 'three'
import { describe, expect, it } from 'vitest'

import { YawnBody } from './yawn-body'

function createVrm() {
  const bones: Record<string, Object3D> = { head: new Object3D(), neck: new Object3D(), upperChest: new Object3D(), leftShoulder: new Object3D(), rightShoulder: new Object3D() }
  const vrm = { meta: { metaVersion: '1' }, humanoid: { getNormalizedBoneNode: (name: string) => bones[name] ?? null } } as unknown as VRM
  return { vrm, bones }
}

describe('yawnBody', () => {
  it('moves the head with the share of the yawn and undoes it on restore', () => {
    const { vrm, bones } = createVrm()
    const body = new YawnBody()
    body.apply(vrm, 1)
    const peak = bones.head.rotation.x
    expect(Math.abs(peak)).toBeGreaterThan(0.1)
    body.restore(vrm)
    body.apply(vrm, 0.5)
    expect(bones.head.rotation.x).toBeCloseTo(peak / 2, 5)
    body.restore(vrm)
    body.apply(vrm, 0)
    expect(bones.head.rotation.x).toBeCloseTo(0, 6)
  })
})
