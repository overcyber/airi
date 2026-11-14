import type { Glb } from './glb'

/**
 * A floor for the spring bones (Plan 10).
 *
 * The hair springs collide with the head, the neck, and the upper back only. When the avatar lies down
 * (`lie-down.fbx`), the braid falls through the floor and through the neck. This step adds a plane collider
 * on the root node of the scene, at the feet, facing up, as a `VRMC_springBone_extended_collider` of the
 * VRM 1.0 spring bone specification. three-vrm 3 reads it. A reader without the extension sees the fallback
 * shape: a small sphere far below the floor, which touches nothing.
 */

export interface FloorColliderReport {
  /** The node that holds the floor, or `undefined` when the file has no spring bones and nothing changed. */
  node?: number
  /** The springs that now collide with the floor. */
  springs: string[]
}

interface SpringBoneExtension {
  specVersion: string
  colliders?: Array<{ node: number, shape: unknown, extensions?: Record<string, unknown> }>
  colliderGroups?: Array<{ name?: string, colliders: number[] }>
  springs?: Array<{ name?: string, colliderGroups?: number[] }>
}

const extendedColliderExtension = 'VRMC_springBone_extended_collider'

/** The root node of the default scene: the first node of the scene, or the first node without a parent. */
function sceneRoot(glb: Glb): number {
  const { json } = glb
  const first = json.scenes?.[json.scene ?? 0]?.nodes?.[0]
  if (first !== undefined)
    return first
  const children = new Set(json.nodes.flatMap(node => node.children ?? []))
  const root = json.nodes.findIndex((_, index) => !children.has(index))
  return root === -1 ? 0 : root
}

/** Adds the floor collider in place. Run it after `addHairSprings`. */
export function addFloorCollider(glb: Glb): FloorColliderReport {
  const { json } = glb
  const springBone = json.extensions?.VRMC_springBone as SpringBoneExtension | undefined
  if (!springBone?.springs?.length)
    return { springs: [] }
  const node = sceneRoot(glb)
  const colliders = springBone.colliders ??= []
  const groups = springBone.colliderGroups ??= []
  colliders.push({
    node,
    shape: { sphere: { offset: [0, -10, 0], radius: 0.01 } },
    extensions: {
      [extendedColliderExtension]: {
        specVersion: '1.0',
        shape: { plane: { offset: [0, 0, 0], normal: [0, 1, 0] } },
      },
    },
  })
  groups.push({ name: 'floor', colliders: [colliders.length - 1] })
  const group = groups.length - 1
  const springs: string[] = []
  springBone.springs.forEach((spring, index) => {
    spring.colliderGroups = [...new Set([...(spring.colliderGroups ?? []), group])]
    springs.push(spring.name ?? `spring ${index}`)
  })
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'VRMC_springBone', extendedColliderExtension])]
  return { node, springs }
}
