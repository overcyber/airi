import type { VRM } from '@pixiv/three-vrm'

import { Object3D, Quaternion } from 'three'
import { describe, expect, it } from 'vitest'

import { BodyInertia } from './body-inertia'

function fakeVrm(): VRM {
  const nodes = new Map<string, Object3D>()
  return {
    meta: { metaVersion: '1' },
    humanoid: {
      getNormalizedBoneNode: (bone: string) => {
        let node = nodes.get(bone)
        if (!node) {
          node = new Object3D()
          nodes.set(bone, node)
        }
        return node
      },
    },
  } as unknown as VRM
}

describe('bodyInertia', () => {
  it('lets the chest lag a fast hips turn, then settles back with a small overshoot', () => {
    const vrm = fakeVrm()
    const inertia = new BodyInertia()
    const hips = vrm.humanoid.getNormalizedBoneNode('hips')!
    const lags: number[] = []
    for (let frame = 0; frame < 120; frame++) {
      inertia.restore(vrm)
      // The hips turn at 2 rad/s for 0.3 s, then stand still.
      if (frame < 18)
        hips.rotateY(2 / 60)
      inertia.apply(vrm, 1 / 60)
      lags.push(inertia.lag.y)
    }

    expect(Math.min(...lags.slice(0, 18))).toBeLessThan(-0.03)
    // After the turn stops, the lag goes past zero once (the overshoot), then fades out.
    expect(Math.max(...lags.slice(18))).toBeGreaterThan(0.001)
    expect(Math.abs(lags.at(-1)!)).toBeLessThan(0.005)
  })

  it('puts every bone back on restore', () => {
    const vrm = fakeVrm()
    const inertia = new BodyInertia()
    const chest = vrm.humanoid.getNormalizedBoneNode('chest')!
    const hips = vrm.humanoid.getNormalizedBoneNode('hips')!
    inertia.apply(vrm, 1 / 60)
    hips.rotateY(0.1)
    inertia.apply(vrm, 1 / 60)
    expect(chest.quaternion.angleTo(new Quaternion())).toBeGreaterThan(0)

    inertia.restore(vrm)
    expect(chest.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6)
  })
})
