import type { Glb } from './glb'
import type { Mat4, Vec3 } from './math'

import { Buffer } from 'node:buffer'

import { AccessorView } from './glb'
import { fromTrs, invert, multiply, quatFromMatrix, quatInvert, quatNormalize, transformPoint, translationOf } from './math'

/**
 * Hair with physics for a Ready Player Me avatar (Plan 08, M2).
 *
 * A Ready Player Me hair is part of the one avatar mesh and is skinned to the `Head` bone only, so it never
 * moves on its own. This step finds the hair that hangs behind the head (a ponytail or a braid), adds a chain
 * of bones along it, moves the weights of those vertices to the chain, and declares the chain as VRM 1.0
 * spring bones (`VRMC_springBone`) with colliders on the head, the neck, and the upper back.
 *
 * Run it after `convertRpmToVrm`: the mesh must be in its bind pose, and the bones in world space.
 */

export interface HairSpringOptions {
  /** Bones of the chain, without the tip. Default: 4. */
  segments?: number
  /** How far behind the head bone a vertex must be to count as hanging hair, in meters. Default: 0.06. */
  behindMeters?: number
}

export interface HairSpringReport {
  /** Vertices that now follow the chain. 0 means the avatar has no hanging hair, and nothing changed. */
  vertices: number
  /** Top and bottom of the hanging hair, in meters. */
  topMeters: number
  bottomMeters: number
  /** Names of the new bones, root first. */
  bones: string[]
}

const minimumVertices = 30
const minimumLengthMeters = 0.08

interface SkinnedVertex {
  index: number
  position: Vec3
}

/** World matrices of the nodes, from their TRS. */
function worldMatrices(glb: Glb): Mat4[] {
  const { nodes } = glb.json
  const parent = new Map<number, number>()
  nodes.forEach((node, index) => node.children?.forEach(child => parent.set(child, index)))
  const cache: Mat4[] = []
  const world = (index: number): Mat4 => {
    if (cache[index])
      return cache[index]
    const node = nodes[index]
    const local = fromTrs(node.translation, node.rotation, node.scale)
    const up = parent.get(index)
    cache[index] = up === undefined ? local : multiply(world(up), local)
    return cache[index]
  }
  return nodes.map((_, index) => world(index))
}

/** Writes one component of a joint or weight accessor, in its own component type. */
function writeComponent(glb: Glb, accessorIndex: number, element: number, component: number, value: number) {
  const accessor = glb.json.accessors[accessorIndex]
  const view = glb.json.bufferViews[accessor.bufferView!]
  const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType as 5121 | 5123 | 5125 | 5126]
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type]
  const stride = view.byteStride ?? bytes * size
  const at = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + element * stride + component * bytes
  switch (accessor.componentType) {
    case 5121:
      glb.bin.writeUInt8(Math.round(accessor.normalized ? value * 255 : value), at)
      break
    case 5123:
      glb.bin.writeUInt16LE(Math.round(accessor.normalized ? value * 65535 : value), at)
      break
    case 5125:
      glb.bin.writeUInt32LE(Math.round(value), at)
      break
    case 5126:
      glb.bin.writeFloatLE(value, at)
      break
    default:
      throw new Error(`Component type ${accessor.componentType} is not supported`)
  }
}

/** Appends bytes to the BIN chunk in a new buffer view, aligned to 4 bytes. Returns the view index. */
function appendView(glb: Glb, data: Buffer): number {
  const padding = (4 - (glb.bin.length % 4)) % 4
  const byteOffset = glb.bin.length + padding
  glb.bin = Buffer.concat([glb.bin, Buffer.alloc(padding), data])
  glb.json.buffers[0].byteLength = glb.bin.length
  glb.json.bufferViews.push({ buffer: 0, byteOffset, byteLength: data.length })
  return glb.json.bufferViews.length - 1
}

/** Points along the hair, from the top to the bottom, at the middle of each height slice. */
function hairCurve(vertices: SkinnedVertex[], top: number, bottom: number, points: number): Vec3[] {
  const curve: Vec3[] = []
  for (let i = 0; i <= points; i++) {
    const y = top - (top - bottom) * (i / points)
    const half = (top - bottom) / points / 2
    const slice = vertices.filter(vertex => Math.abs(vertex.position[1] - y) <= Math.max(half, 0.015))
    const source = slice.length > 0 ? slice : vertices
    const x = source.reduce((sum, vertex) => sum + vertex.position[0], 0) / source.length
    const z = source.reduce((sum, vertex) => sum + vertex.position[2], 0) / source.length
    curve.push([x, y, z])
  }
  return curve
}

function distance(a: Vec3, b: Vec3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/**
 * Spring settings of the hair joint `index`, root first: stiffer at the root, freer at the tip, like a real
 * braid. Stiffness 1 with drag 0.35 held the braid stiff as a stick, so the hair never seemed to move.
 */
export function hairJointSettings(index: number) {
  return {
    hitRadius: 0.02,
    stiffness: Math.max(0.12, 0.55 - index * 0.11),
    gravityPower: 0.55,
    gravityDir: [0, -1, 0] as [number, number, number],
    dragForce: 0.2,
  }
}

/**
 * Adds the hair chain and its spring bones in place. The GLB must have the `VRMC_vrm` extension.
 * Returns a report with 0 vertices, and changes nothing, when the avatar has no hanging hair.
 */
export function addHairSprings(glb: Glb, options: HairSpringOptions = {}): HairSpringReport {
  const { json } = glb
  const segments = options.segments ?? 4
  const behind = options.behindMeters ?? 0.06
  const nodeIndex = new Map(json.nodes.map((node, index) => [node.name ?? '', index]))
  const head = nodeIndex.get('Head')
  const meshNode = json.nodes.findIndex(node => node.mesh !== undefined && node.skin !== undefined)
  const empty: HairSpringReport = { vertices: 0, topMeters: 0, bottomMeters: 0, bones: [] }
  if (head === undefined || meshNode < 0)
    return empty

  const worlds = worldMatrices(glb)
  const meshWorld = worlds[meshNode]
  const skin = json.skins![json.nodes[meshNode].skin!]
  const headSlot = skin.joints.indexOf(head)
  const headWorld = translationOf(worlds[head])
  const primitive = json.meshes[json.nodes[meshNode].mesh!].primitives[0]
  const positions = new AccessorView(glb, primitive.attributes.POSITION)
  const joints = new AccessorView(glb, primitive.attributes.JOINTS_0)
  const weights = new AccessorView(glb, primitive.attributes.WEIGHTS_0)

  // Hanging hair: vertices that follow the head only, behind the head, and lower than the top of the neck.
  // The face and the scalp stay on the head. A vertex above the head bone joins only near the root.
  const hair: SkinnedVertex[] = []
  for (let vertex = 0; vertex < positions.count; vertex++) {
    let headWeight = 0
    for (let k = 0; k < 4; k++) {
      if (joints.get(vertex, k) === headSlot)
        headWeight += weights.get(vertex, k)
    }
    if (headWeight < 0.95)
      continue
    const position = transformPoint(meshWorld, [positions.get(vertex, 0), positions.get(vertex, 1), positions.get(vertex, 2)])
    if (position[2] < headWorld[2] - behind && position[1] < headWorld[1] + 0.07)
      hair.push({ index: vertex, position })
  }
  if (hair.length < minimumVertices)
    return empty
  const top = Math.max(...hair.map(vertex => vertex.position[1]))
  const bottom = Math.min(...hair.map(vertex => vertex.position[1]))
  if (top - bottom < minimumLengthMeters)
    return empty

  // The chain: a root at the top of the hair, then joints down its middle, and a tip at the bottom.
  const curve = hairCurve(hair, top, bottom, segments)
  const headInverse = invert(worlds[head])
  const firstNode = json.nodes.length
  const names: string[] = []
  curve.forEach((point, i) => {
    const name = i === curve.length - 1 ? 'J_Sec_Hair_Tip' : `J_Sec_Hair_${i + 1}`
    names.push(name)
    // The root hangs on the head. Every other joint hangs on the joint above it, with no rotation.
    const translation = i === 0 ? transformPoint(headInverse, point) : [point[0] - curve[i - 1][0], point[1] - curve[i - 1][1], point[2] - curve[i - 1][2]] as Vec3
    // The root cancels the rotation of the head, so the whole chain has no rotation in world space.
    const rotation = i === 0 ? quatInvert(quatNormalize(quatFromMatrix(worlds[head]))) : undefined
    json.nodes.push({ name, translation: [translation[0], translation[1], translation[2]], ...(rotation && { rotation }), ...(i < curve.length - 1 && { children: [firstNode + i + 1] }) })
  })
  json.nodes[head].children = [...(json.nodes[head].children ?? []), firstNode]

  // Skin: the chain joints, except the tip, join the skin with their inverse bind matrices.
  const chainNodes = curve.slice(0, -1).map((_, i) => firstNode + i)
  const firstSlot = skin.joints.length
  skin.joints.push(...chainNodes)
  const chainWorlds = curve.slice(0, -1).map(point => fromTrs(point))
  const inverseBinds = new AccessorView(glb, skin.inverseBindMatrices!)
  const matrices = Buffer.alloc(skin.joints.length * 64)
  for (let slot = 0; slot < firstSlot; slot++) {
    for (let i = 0; i < 16; i++)
      matrices.writeFloatLE(inverseBinds.get(slot, i), slot * 64 + i * 4)
  }
  chainWorlds.forEach((world, i) => {
    const inverseBind = multiply(invert(world), meshWorld)
    for (let k = 0; k < 16; k++)
      matrices.writeFloatLE(inverseBind[k], (firstSlot + i) * 64 + k * 4)
  })
  json.accessors.push({ bufferView: appendView(glb, matrices), componentType: 5126, count: skin.joints.length, type: 'MAT4' })
  skin.inverseBindMatrices = json.accessors.length - 1
  if (json.accessors[primitive.attributes.JOINTS_0].componentType === 5121 && skin.joints.length > 255)
    throw new Error('The skin has more than 255 joints, and JOINTS_0 is 8 bits')

  // Weights: each hair vertex follows the two chain joints around its height. Near the root it blends
  // with the head over 3 cm, so the scalp does not tear.
  const step = (top - bottom) / segments
  for (const vertex of hair) {
    const along = Math.min(segments - 1e-6, Math.max(0, (top - vertex.position[1]) / step))
    const lower = Math.floor(along)
    const fraction = along - lower
    const blendHead = Math.max(0, 1 - (top - vertex.position[1]) / 0.03) * 0.6
    const slots = [firstSlot + lower, firstSlot + Math.min(lower + 1, segments - 1), headSlot, headSlot]
    const amounts = [(1 - fraction) * (1 - blendHead), fraction * (1 - blendHead), blendHead, 0]
    for (let k = 0; k < 4; k++) {
      writeComponent(glb, primitive.attributes.JOINTS_0, vertex.index, k, slots[k])
      writeComponent(glb, primitive.attributes.WEIGHTS_0, vertex.index, k, amounts[k])
    }
  }

  // Colliders: spheres on the head, the neck, and the upper back, smaller than the distance to the hair
  // at rest, so the springs do not start inside a collider.
  const hitRadius = 0.02
  const fit = (center: Vec3, wanted: number) => Math.max(0.02, Math.min(wanted, ...curve.map(point => distance(point, center) - hitRadius - 0.01)))
  const colliders: unknown[] = []
  const addSphere = (boneName: string, offset: Vec3, wanted: number) => {
    const bone = nodeIndex.get(boneName)
    if (bone === undefined)
      return
    const center = transformPoint(worlds[bone], offset)
    colliders.push({ node: bone, shape: { sphere: { offset, radius: fit(center, wanted) } } })
  }
  addSphere('Head', [0, 0.08, 0], 0.1)
  addSphere('Neck', [0, 0.04, 0], 0.06)
  addSphere('Spine2', [0, 0.1, -0.02], 0.12)
  addSphere('LeftShoulder', [0, 0.05, 0], 0.06)
  addSphere('RightShoulder', [0, 0.05, 0], 0.06)

  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'VRMC_springBone'])]
  json.extensions = {
    ...json.extensions,
    VRMC_springBone: {
      specVersion: '1.0',
      colliders,
      colliderGroups: [{ name: 'body', colliders: colliders.map((_, i) => i) }],
      springs: [{
        name: 'hair',
        joints: names.map((_, i) => ({ node: firstNode + i, ...hairJointSettings(i) })),
        colliderGroups: [0],
        center: nodeIndex.get('Hips'),
      }],
    },
  }

  return { vertices: hair.length, topMeters: top, bottomMeters: bottom, bones: names }
}
