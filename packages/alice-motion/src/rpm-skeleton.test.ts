import { describe, expect, it } from 'vitest'

import { rpmHumanBones, rpmRestSkeleton, vrmBoneOfRpmName } from './rpm-skeleton'

describe('rpm skeleton', () => {
  it('maps Ready Player Me and Mixamo names to VRM bones', () => {
    expect(vrmBoneOfRpmName('LeftForeArm')).toBe('leftLowerArm')
    expect(vrmBoneOfRpmName('mixamorigLeftForeArm')).toBe('leftLowerArm')
    expect(vrmBoneOfRpmName('mixamorig:Spine2')).toBe('upperChest')
    expect(vrmBoneOfRpmName('RightHandPinky1')).toBe('rightLittleProximal')
    expect(vrmBoneOfRpmName('Armature')).toBeUndefined()
  })

  it('lists every humanoid bone once, parents before children, with unit rotations', () => {
    const names = rpmRestSkeleton.map(bone => bone.name)

    expect(new Set(names).size).toBe(names.length)
    expect(new Set(names)).toEqual(new Set(Object.values(rpmHumanBones)))
    rpmRestSkeleton.forEach((bone, index) => {
      if (bone.parent)
        expect(names.indexOf(bone.parent)).toBeLessThan(index)
      expect(Math.hypot(...bone.rotation)).toBeCloseTo(1, 3)
    })
  })
})
