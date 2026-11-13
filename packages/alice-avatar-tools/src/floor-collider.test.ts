import type { Glb } from './glb'

import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { addFloorCollider } from './floor-collider'

function createGlb(springBone?: Record<string, unknown>): Glb {
  return {
    json: {
      asset: { version: '2.0' },
      nodes: [{ name: 'Armature', children: [1] }, { name: 'Hips', children: [2] }, { name: 'J_Sec_Hair_1' }],
      meshes: [],
      accessors: [],
      bufferViews: [],
      buffers: [],
      scenes: [{ nodes: [0] }],
      scene: 0,
      extensionsUsed: ['VRMC_vrm', ...(springBone ? ['VRMC_springBone'] : [])],
      extensions: springBone ? { VRMC_springBone: springBone } : {},
    },
    bin: Buffer.alloc(0),
  }
}

describe('addFloorCollider', () => {
  it('adds a plane at the feet of the scene root, and every spring collides with it', () => {
    const glb = createGlb({
      specVersion: '1.0',
      colliders: [{ node: 1, shape: { sphere: { offset: [0, 0, 0], radius: 0.1 } } }],
      colliderGroups: [{ name: 'body', colliders: [0] }],
      springs: [{ name: 'hair', joints: [{ node: 2 }], colliderGroups: [0] }],
    })

    expect(addFloorCollider(glb)).toEqual({ node: 0, springs: ['hair'] })

    const springBone = glb.json.extensions!.VRMC_springBone as { colliders: unknown[], colliderGroups: unknown[], springs: Array<{ colliderGroups: number[] }> }
    expect(springBone.colliders[1]).toEqual({
      node: 0,
      shape: { sphere: { offset: [0, -10, 0], radius: 0.01 } },
      extensions: { VRMC_springBone_extended_collider: { specVersion: '1.0', shape: { plane: { offset: [0, 0, 0], normal: [0, 1, 0] } } } },
    })
    expect(springBone.colliderGroups[1]).toEqual({ name: 'floor', colliders: [1] })
    expect(springBone.springs[0].colliderGroups).toEqual([0, 1])
    expect(glb.json.extensionsUsed).toContain('VRMC_springBone_extended_collider')
  })

  it('changes nothing without spring bones', () => {
    const glb = createGlb()

    expect(addFloorCollider(glb)).toEqual({ springs: [] })
    expect(glb.json.extensionsUsed).not.toContain('VRMC_springBone_extended_collider')
  })
})
