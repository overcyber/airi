import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'
import type { AnimationClip, KeyframeTrack, Object3D } from 'three'

import { rpmRestSkeleton, vrmBoneOfRpmName } from '@proj-airi/alice-motion'
import { AnimationClip as Clip, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

/**
 * Retargets a Mixamo or Ready Player Me FBX animation to a VRM (sprint V5).
 *
 * The method follows the Mixamo example of three-vrm (MIT, pixiv): each local rotation becomes a rotation
 * of the normalized bone, `parentRestWorld * local * restWorld^-1`. That example needs a source in T pose.
 * The FBX animations of the TalkingHead server are local rotations on the Ready Player Me skeleton, whose
 * arms rest in an A pose. So the retarget also turns the source rest into a T pose, with the same method as
 * the avatar converter of V4: the arm chains point along the X axis.
 *
 * Source kinds:
 * - Mixamo (`mixamorig` bone names): the rest pose comes from the bones of the FBX file.
 * - Ready Player Me (no prefix, TalkingHead exports): the rest pose comes from `rpmRestSkeleton`, because these
 *   files store the first animation frame in place of the rest pose.
 */

interface SourceBone {
  /** Bone name in the tracks. */
  trackName: string
  vrmBone: VRMHumanBoneName
  parent?: string
  restWorld: Quaternion
  /** World rotation of the parent node at rest, also for a parent that is not a humanoid bone. */
  parentRestWorld: Quaternion
}

/** Arm chains of the T pose, with the world direction of each bone. Same chains as the V4 converter. */
const tPoseChains: Array<[bone: string, direction: Vector3]> = [
  ['LeftArm', new Vector3(1, 0, 0)],
  ['LeftForeArm', new Vector3(1, 0, 0)],
  ['LeftHand', new Vector3(1, 0, 0)],
  ['RightArm', new Vector3(-1, 0, 0)],
  ['RightForeArm', new Vector3(-1, 0, 0)],
  ['RightHand', new Vector3(-1, 0, 0)],
]

/** Hips height of the Ready Player Me rest skeleton, in meters. */
const rpmHipsHeightMeters = 1.037

const up = new Vector3(0, 1, 0)

function bareName(name: string) {
  return name.replace(/^mixamorig\d*:?/, '')
}

/** Bones that the avatar converter of V4 turns into the T pose. Their rest on the VRM is not the source rest. */
const convertedBones = new Set(['LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'])

/**
 * The local rest rotations of a VRM made from a Ready Player Me avatar, by Ready Player Me bone name.
 * `undefined` for another rig: its bones have other local axes, so the table stays the better source.
 *
 * The table is one Ready Player Me avatar. Eva rests with straighter fingers (up to 30 degrees per joint),
 * other thumbs and other shoulders. TalkingHead sets its templates on the bones of the avatar itself, so with the
 * table her fingers bent backwards in the namaste.
 */
function rpmRestOfVrm(vrm: VRM): Map<string, Quaternion> | undefined {
  if (vrm.humanoid.getRawBoneNode('leftIndexProximal')?.name !== 'LeftHandIndex1')
    return undefined
  const pose = vrm.humanoid.rawRestPose
  const rest = new Map<string, Quaternion>()
  for (const bone of rpmRestSkeleton) {
    const vrmBone = vrmBoneOfRpmName(bone.name) as VRMHumanBoneName | undefined
    const rotation = vrmBone ? pose[vrmBone]?.rotation : undefined
    if (rotation && !convertedBones.has(bone.name))
      rest.set(bone.name, new Quaternion(...rotation).normalize())
  }
  return rest
}

/**
 * Rest bones of a Ready Player Me source: world rotations chained from the table, parents first.
 * `restOfVrm` replaces the table rest of the bones that the target VRM has from the same avatar.
 */
function rpmSourceBones(restOfVrm?: Map<string, Quaternion>): Map<string, SourceBone> {
  const bones = new Map<string, SourceBone>()
  for (const bone of rpmRestSkeleton) {
    const vrmBone = vrmBoneOfRpmName(bone.name) as VRMHumanBoneName | undefined
    if (!vrmBone)
      continue
    // The table has 5 decimals. Normalize, because the inverse below assumes a unit quaternion.
    const local = restOfVrm?.get(bone.name)?.clone() ?? new Quaternion(...bone.rotation).normalize()
    const parentWorld = bone.parent ? bones.get(bone.parent)?.restWorld ?? new Quaternion() : new Quaternion()
    bones.set(bone.name, { trackName: bone.name, vrmBone, parent: bone.parent, restWorld: parentWorld.clone().multiply(local), parentRestWorld: parentWorld.clone() })
  }
  return bones
}

/** Rest bones of a Mixamo source: world rotations of the bones in the FBX file. */
function mixamoSourceBones(asset: Object3D): Map<string, SourceBone> {
  asset.updateMatrixWorld(true)
  const bones = new Map<string, SourceBone>()
  asset.traverse((node) => {
    const vrmBone = vrmBoneOfRpmName(node.name) as VRMHumanBoneName | undefined
    if (!vrmBone)
      return
    const parent = node.parent && vrmBoneOfRpmName(node.parent.name) ? bareName(node.parent.name) : undefined
    bones.set(bareName(node.name), {
      trackName: node.name,
      vrmBone,
      parent,
      restWorld: node.getWorldQuaternion(new Quaternion()),
      parentRestWorld: node.parent ? node.parent.getWorldQuaternion(new Quaternion()) : new Quaternion(),
    })
  })
  return bones
}

/**
 * World rotation that turns each source rest bone into its T pose. Bones point along their local +Y,
 * as in Mixamo and Ready Player Me. A bone below a chain bone, for example a finger, follows its chain.
 */
function tPoseCorrections(bones: Map<string, SourceBone>): Map<string, Quaternion> {
  const corrections = new Map<string, Quaternion>()
  const correctionOf = (name: string | undefined): Quaternion => name ? corrections.get(name) ?? correctionOf(bones.get(name)?.parent) : new Quaternion()
  for (const [name, direction] of tPoseChains) {
    const bone = bones.get(name)
    if (!bone)
      continue
    const inherited = correctionOf(bone.parent)
    const current = up.clone().applyQuaternion(bone.restWorld).applyQuaternion(inherited).normalize()
    corrections.set(name, new Quaternion().setFromUnitVectors(current, direction).multiply(inherited))
  }
  return new Map([...bones.keys()].map(name => [name, correctionOf(name)]))
}

/**
 * Builds a VRM clip from an FBX animation clip.
 *
 * Before: the clip of an FBX file and, for a Mixamo source, the loaded FBX object.
 * After: a clip on the normalized bones of `vrm`, or `null` when no track maps to a VRM bone.
 */
export function retargetFbxClip(vrm: VRM, clip: AnimationClip, asset?: Object3D): AnimationClip | null {
  const mixamo = clip.tracks.some(track => track.name.startsWith('mixamorig'))
  if (mixamo && !asset)
    throw new Error('A Mixamo FBX clip needs its FBX object for the rest pose')
  const bones = mixamo ? mixamoSourceBones(asset!) : rpmSourceBones(rpmRestOfVrm(vrm))
  const corrections = tPoseCorrections(bones)
  const flip = vrm.meta?.metaVersion === '0'

  const hipsTrack = clip.tracks.find(track => bareName(track.name.split('.')[0]) === 'Hips' && track.name.endsWith('.position'))
  const sourceHipsHeight = mixamo
    ? asset!.getObjectByName(bones.get('Hips')!.trackName)!.getWorldPosition(new Vector3()).y
    : (hipsTrack && Math.max(...Array.from(hipsTrack.values).map(Math.abs)) > 10 ? rpmHipsHeightMeters * 100 : rpmHipsHeightMeters)
  // The rest height, not the current one: a clip built while she sits must not shrink the next pose.
  const restHips = vrm.humanoid.normalizedRestPose?.hips?.position
  const vrmHips = vrm.humanoid.getNormalizedBoneNode('hips')
  const vrmHipsHeight = restHips
    ? Math.abs(restHips[1])
    : vrmHips ? Math.abs(vrmHips.getWorldPosition(new Vector3()).y - vrm.scene.getWorldPosition(new Vector3()).y) : 1
  const hipsScale = sourceHipsHeight > 0 ? vrmHipsHeight / sourceHipsHeight : 1

  const tracks: KeyframeTrack[] = []
  const rotation = new Quaternion()
  for (const track of clip.tracks) {
    const [nodeName, property] = track.name.split('.')
    const name = bareName(nodeName)
    const bone = bones.get(name)
    const target = bone && vrm.humanoid.getNormalizedBoneNode(bone.vrmBone)
    if (!bone || !target)
      continue

    if (property === 'quaternion') {
      const parentWorld = bone.parentRestWorld
      const restInverse = bone.restWorld.clone().invert()
      const parentCorrection = bone.parent ? corrections.get(bone.parent)! : new Quaternion()
      const correctionInverse = corrections.get(name)!.clone().invert()
      const values = new Float32Array(track.values.length)
      for (let i = 0; i < track.values.length; i += 4) {
        rotation.fromArray(track.values, i)
        // Rotation of the normalized bone: rest-relative, then from the source A pose to the T pose.
        rotation.premultiply(parentWorld).multiply(restInverse)
        rotation.premultiply(parentCorrection).multiply(correctionInverse)
        values[i] = flip ? -rotation.x : rotation.x
        values[i + 1] = rotation.y
        values[i + 2] = flip ? -rotation.z : rotation.z
        values[i + 3] = rotation.w
      }
      tracks.push(new QuaternionKeyframeTrack(`${target.name}.quaternion`, Array.from(track.times), Array.from(values)))
    }
    else if (property === 'position' && bone.vrmBone === 'hips') {
      const values = Array.from(track.values, (value, i) => (flip && i % 3 !== 1 ? -value : value) * hipsScale)
      tracks.push(new VectorKeyframeTrack(`${target.name}.position`, Array.from(track.times), values))
    }
  }
  return tracks.length === 0 ? null : new Clip(clip.name || 'fbx', clip.duration, tracks)
}

/** Loads an FBX file and retargets its first animation to `vrm`. Throws when nothing maps. */
export async function loadFbxClip(vrm: VRM, url: string): Promise<AnimationClip> {
  const asset = await new FBXLoader().loadAsync(url)
  const clip = asset.animations.find(animation => animation.name === 'mixamo.com') ?? asset.animations[0]
  if (!clip)
    throw new Error(`No animation in ${url}`)
  const retargeted = retargetFbxClip(vrm, clip, asset)
  if (!retargeted)
    throw new Error(`No bone of ${url} maps to the VRM`)
  return retargeted
}
