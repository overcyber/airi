import type { Glb, GltfJson, GltfNode } from './glb'

import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { AccessorView, readGlb, writeGlb } from './glb'
import { addHairSprings } from './hair-springs'
import { fromTrs, invert, multiply, transformPoint } from './math'

/**
 * A head with a braid: 40 vertices behind the head, from 1.62 m down to 1.35 m, skinned to `Head`,
 * and one face vertex in front of the head. The head bone sits at 1.55 m.
 */
function createHead(options: { braid?: boolean } = {}): Glb {
  const nodes: GltfNode[] = [
    { name: 'Hips', translation: [0, 1, 0], children: [1] },
    { name: 'Spine2', translation: [0, 0.35, 0], children: [2] },
    { name: 'Neck', translation: [0, 0.12, 0], children: [3] },
    { name: 'Head', translation: [0, 0.08, 0] },
    { name: 'Wolf3D_Avatar', mesh: 0, skin: 0 },
  ]
  const positions: number[] = [0, 1.65, 0.1]
  if (options.braid !== false) {
    for (let i = 0; i < 40; i++)
      positions.push(i % 2 === 0 ? 0.02 : -0.02, 1.615 - (0.265 * i) / 39, -0.12)
  }
  const count = positions.length / 3
  const floats = (values: number[]) => Buffer.from(new Float32Array(values).buffer)
  const headWorld = fromTrs([0, 1.55, 0])
  const chunks = [
    floats(positions),
    Buffer.from(new Uint8Array(Array.from({ length: count }, () => [0, 0, 0, 0]).flat())),
    floats(Array.from({ length: count }, () => [1, 0, 0, 0]).flat()),
    floats([...invert(headWorld)]),
  ]
  const views: GltfJson['bufferViews'] = []
  let offset = 0
  for (const chunk of chunks) {
    views.push({ buffer: 0, byteOffset: offset, byteLength: chunk.length })
    offset += chunk.length
  }
  const json: GltfJson = {
    asset: { version: '2.0' },
    extensionsUsed: ['VRMC_vrm'],
    extensions: { VRMC_vrm: { specVersion: '1.0' } },
    nodes,
    scenes: [{ nodes: [0, 4] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 } }] }],
    skins: [{ joints: [3], inverseBindMatrices: 3 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: 'VEC3' },
      { bufferView: 1, componentType: 5121, count, type: 'VEC4' },
      { bufferView: 2, componentType: 5126, count, type: 'VEC4' },
      { bufferView: 3, componentType: 5126, count: 1, type: 'MAT4' },
    ],
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  }
  return readGlb(writeGlb({ json, bin: Buffer.concat(chunks) }))
}

/** World matrix of a node, from the TRS of the node and its parents. */
function worldOf(glb: Glb, index: number) {
  const parentOf = (child: number) => glb.json.nodes.findIndex(node => node.children?.includes(child))
  const local = (i: number) => fromTrs(glb.json.nodes[i].translation, glb.json.nodes[i].rotation)
  let world = local(index)
  for (let parent = parentOf(index); parent >= 0; parent = parentOf(parent))
    world = multiply(local(parent), world)
  return world
}

describe('addHairSprings', () => {
  it('adds a spring chain along the hanging hair and moves its weights to the chain', () => {
    const glb = readGlb(writeGlb(createHead()))
    const report = addHairSprings(glb)

    expect(report.vertices).toBe(40)
    expect(report.bones).toEqual(['J_Sec_Hair_1', 'J_Sec_Hair_2', 'J_Sec_Hair_3', 'J_Sec_Hair_4', 'J_Sec_Hair_Tip'])
    expect(report.topMeters).toBeCloseTo(1.615, 3)
    expect(report.bottomMeters).toBeCloseTo(1.35, 3)

    const written = readGlb(writeGlb(glb))
    const skin = written.json.skins![0]
    expect(skin.joints).toHaveLength(5)
    const springs = (written.json.extensions!.VRMC_springBone as { springs: Array<{ joints: unknown[], colliderGroups: number[] }>, colliders: unknown[] }).springs
    expect(springs[0].joints).toHaveLength(5)
    expect(written.json.extensionsUsed).toContain('VRMC_springBone')

    // The face vertex stays on the head. The lowest braid vertex follows the last chain joint.
    const joints = new AccessorView(written, 1)
    const weights = new AccessorView(written, 2)
    expect([joints.get(0, 0), weights.get(0, 0)]).toEqual([0, 1])
    const last = 40
    expect(skin.joints[joints.get(last, 0)]).toBe(written.json.nodes.findIndex(node => node.name === 'J_Sec_Hair_4'))
    const sum = [0, 1, 2, 3].reduce((total, k) => total + weights.get(last, k), 0)
    expect(sum).toBeCloseTo(1, 5)

    // Each new joint is bound at its rest place: world times inverse bind is the identity.
    const inverseBinds = new AccessorView(written, skin.inverseBindMatrices!)
    skin.joints.forEach((node, slot) => {
      const inverseBind = new Float64Array(16).map((_, i) => inverseBinds.get(slot, i))
      const point = transformPoint(multiply(worldOf(written, node), inverseBind), [0.1, 0.2, 0.3])
      expect(point.map(value => Math.round(value * 1e4) / 1e4)).toEqual([0.1, 0.2, 0.3])
    })
  })

  it('changes nothing when the avatar has no hanging hair', () => {
    const glb = createHead({ braid: false })
    const before = JSON.stringify(glb.json)

    expect(addHairSprings(glb).vertices).toBe(0)
    expect(JSON.stringify(glb.json)).toBe(before)
  })
})
