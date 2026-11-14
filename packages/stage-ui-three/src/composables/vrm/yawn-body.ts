import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'

import { proceduralAxisSign } from './procedural-axes'

/**
 * The body of a yawn at its peak, in radians on the normalized bones, in the axes of the VRM 0.x tuning
 * (`procedural-axes.ts`). In these axes a positive x takes the head back. Checked on a render of Eva (VRM 1.0).
 * The head goes back, the chest opens, and the shoulders rise.
 */
const yawnOffsets: Array<[bone: VRMHumanBoneName, x: number, y: number, z: number]> = [
  ['head', 0.14, 0, 0.04],
  ['neck', 0.06, 0, 0],
  ['upperChest', 0.06, 0, 0],
  ['leftShoulder', 0, 0, 0.09],
  ['rightShoulder', 0, 0, -0.09],
]

/**
 * The body layer of a yawn, on top of the animation. `share` is the progress of the yawn of the face
 * (`MoodFace.yawnShare`), so the face and the body move together.
 *
 * Frame order, like `PerformanceDirector`: {@link restore} before the animation mixer, {@link apply} after it.
 */
export class YawnBody {
  private readonly applied = new Map<VRMHumanBoneName, [number, number, number]>()

  /** Removes the offsets of the last frame. */
  restore(vrm: VRM) {
    for (const [name, [x, y, z]] of this.applied) {
      const bone = vrm.humanoid?.getNormalizedBoneNode(name)
      if (bone) {
        bone.rotation.x -= x
        bone.rotation.y -= y
        bone.rotation.z -= z
      }
    }
    this.applied.clear()
  }

  apply(vrm: VRM, share: number) {
    if (share <= 0)
      return
    const sign = proceduralAxisSign(vrm)
    for (const [name, x, y, z] of yawnOffsets) {
      const bone = vrm.humanoid?.getNormalizedBoneNode(name)
      if (!bone)
        continue
      const offset: [number, number, number] = [sign * x * share, y * share, sign * z * share]
      bone.rotation.x += offset[0]
      bone.rotation.y += offset[1]
      bone.rotation.z += offset[2]
      this.applied.set(name, offset)
    }
  }
}
