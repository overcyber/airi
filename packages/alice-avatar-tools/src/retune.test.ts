import type { Glb } from './glb'

import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { hairJointSettings } from './hair-springs'
import { retuneVrm } from './retune'

function createVrm(): Glb {
  return {
    json: {
      asset: { version: '2.0' },
      nodes: [{ name: 'Armature', children: [1, 2] }, { name: 'Hips', children: [3] }, { name: 'Wolf3D_Avatar', mesh: 0 }, { name: 'J_Sec_Hair_1' }],
      meshes: [{ primitives: [], extras: { targetNames: ['mouthSmileLeft', 'cheekSquintLeft', 'viseme_aa'] } }],
      accessors: [],
      bufferViews: [],
      buffers: [],
      scenes: [{ nodes: [0] }],
      extensionsUsed: ['VRMC_vrm', 'VRMC_springBone'],
      extensions: {
        VRMC_vrm: {
          expressions: {
            preset: {
              happy: { morphTargetBinds: [{ node: 2, index: 0, weight: 0.8 }, { node: 2, index: 1, weight: 0.5 }] },
              aa: { morphTargetBinds: [{ node: 2, index: 2, weight: 1 }] },
            },
          },
        },
        VRMC_springBone: {
          specVersion: '1.0',
          colliders: [],
          colliderGroups: [],
          springs: [{ name: 'hair', joints: [{ node: 3, hitRadius: 0.02, stiffness: 1, gravityPower: 0.4, gravityDir: [0, -1, 0], dragForce: 0.35 }], colliderGroups: [] }],
        },
      },
    },
    bin: Buffer.alloc(0),
  }
}

describe('retuneVrm', () => {
  it('softens the presets, frees the hair, and adds the floor once', () => {
    const glb = createVrm()

    expect(retuneVrm(glb)).toEqual({ presets: ['happy'], hairJoints: 1, floor: true })

    const vrm = glb.json.extensions!.VRMC_vrm as { expressions: { preset: Record<string, { morphTargetBinds: Array<{ weight: number }> }> } }
    expect(vrm.expressions.preset.happy.morphTargetBinds.map(bind => bind.weight)).toEqual([0.5, 0.3])
    expect(vrm.expressions.preset.aa.morphTargetBinds[0].weight).toBe(1)
    const springBone = glb.json.extensions!.VRMC_springBone as { springs: Array<{ joints: Array<Record<string, unknown>> }>, colliders: unknown[] }
    expect(springBone.springs[0].joints[0]).toMatchObject(hairJointSettings(0))
    expect(springBone.colliders).toHaveLength(1)

    // A second run changes nothing more.
    expect(retuneVrm(glb)).toEqual({ presets: [], hairJoints: 1, floor: false })
    expect(springBone.colliders).toHaveLength(1)
  })
})
