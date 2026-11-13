import type { Glb } from './glb'

import { addFloorCollider } from './floor-collider'
import { hairJointSettings } from './hair-springs'
import { presetBlendShapes } from './rpm-to-vrm'

/**
 * Brings a VRM that an older version of this converter made up to date, without a new conversion:
 * the preset expressions get the weights of `presetBlendShapes`, the hair springs get `hairJointSettings`,
 * and the floor collider is added when it is missing. The mesh, the textures, and the skeleton do not change.
 */

export interface RetuneReport {
  /** Preset expressions whose weights changed. */
  presets: string[]
  /** Spring joints whose settings changed. */
  hairJoints: number
  floor: boolean
}

interface MorphBind {
  node: number
  index: number
  weight: number
}

interface VrmExtension {
  expressions?: { preset?: Record<string, { morphTargetBinds?: MorphBind[] }> }
}

interface SpringBoneExtension {
  colliders?: Array<{ extensions?: Record<string, unknown> }>
  springs?: Array<{ name?: string, joints: Array<Record<string, unknown> & { node: number }> }>
}

const extendedColliderExtension = 'VRMC_springBone_extended_collider'

/** Retunes the file in place. */
export function retuneVrm(glb: Glb): RetuneReport {
  const { json } = glb
  const report: RetuneReport = { presets: [], hairJoints: 0, floor: false }

  const vrm = json.extensions?.VRMC_vrm as VrmExtension | undefined
  const presets = vrm?.expressions?.preset ?? {}
  for (const [name, weights] of Object.entries(presetBlendShapes)) {
    const preset = presets[name]
    if (!preset?.morphTargetBinds?.length)
      continue
    let changed = false
    for (const bind of preset.morphTargetBinds) {
      const targetName = json.meshes[json.nodes[bind.node].mesh!]?.extras?.targetNames?.[bind.index]
      const weight = targetName !== undefined ? weights[targetName] : undefined
      if (weight !== undefined && weight !== bind.weight) {
        bind.weight = weight
        changed = true
      }
    }
    if (changed)
      report.presets.push(name)
  }

  const springBone = json.extensions?.VRMC_springBone as SpringBoneExtension | undefined
  const hair = springBone?.springs?.find(spring => spring.name === 'hair')
  hair?.joints.forEach((joint, index) => {
    Object.assign(joint, hairJointSettings(index))
    report.hairJoints++
  })
  const hasFloor = springBone?.colliders?.some(collider => collider.extensions?.[extendedColliderExtension] !== undefined) ?? false
  if (!hasFloor && springBone?.springs?.length)
    report.floor = addFloorCollider(glb).node !== undefined
  return report
}
