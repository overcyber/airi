import { describe, expect, it } from 'vitest'

import { avatarRigBones, avatarRigData, rigBone } from './avatar-rig'
import { parseCustomMotion } from './custom-motion'

describe('avatarRig', () => {
  it('lists every humanoid bone of Eva but the eyes, with axes and limits, and the 52 face shapes minus the eye look', () => {
    expect(avatarRigBones).toHaveLength(52)
    expect(rigBone('leftUpperArm')?.axes.levantar).toMatchObject({ min: 0, max: 180 })
    expect(rigBone('rightIndexProximal')?.axes.fechar.max).toBe(90)
    expect(rigBone('leftEye')).toBeUndefined()
    const data = avatarRigData()
    expect(Object.keys(data.face)).toContain('jawOpen')
    expect(Object.keys(data.face).some(name => name.startsWith('eyeLook'))).toBe(false)
  })
})

describe('parseCustomMotion', () => {
  it('reads a pose of bones, clamps a value over the limit, and drops what the rig does not have', () => {
    const result = parseCustomMotion({
      name: 'bracos_para_cima',
      kind: 'pose',
      save: true,
      bones: { leftUpperArm: { levantar: 200, frente: 10 }, rightUpperArm: { levantar: 170 }, tail: { x: 1 } },
      face: { mouthSmileLeft: 0.4, sparkle: 1 },
    })
    expect(result).toMatchObject({ ok: true, save: true, motion: { name: 'bracos_para_cima', kind: 'pose', format: 'bones', duration: 10 } })
    if (!result.ok)
      return
    expect(result.motion.keyframes[0].bones.leftUpperArm).toEqual({ levantar: 180, frente: 10 })
    expect(result.motion.keyframes[0].face).toEqual({ mouthSmileLeft: 0.4 })
    expect(result.warnings.join(' ')).toMatch(/clamped leftUpperArm.levantar.*ignored bone tail.*ignored face shape sparkle/)
  })

  it('spreads key frames without time over the duration of a gesture', () => {
    const result = parseCustomMotion({ duration: 2, keyframes: [{ bones: { head: { frente: 20 } } }, { bones: { head: { frente: -10 } } }, { bones: { head: { frente: 20 } } }] })
    expect(result.ok && result.motion.keyframes.map(frame => frame.t)).toEqual([0, 1, 2])
    expect(result.ok && result.motion.kind).toBe('gesture')
  })

  it('reads the template of defineGesture and of definePose, as on the old mirror', () => {
    const gesture = parseCustomMotion({ name: 'saudacao', template: { 'LeftArm.rotation': { x: -0.74, y: [0.3, 0.5], z: 0.27 }, 'Tail.rotation': { x: 0, y: 0, z: 0 } } })
    expect(gesture).toMatchObject({ ok: true, motion: { format: 'talkinghead', kind: 'gesture', props: { 'LeftArm.rotation': { x: -0.74, y: [0.3, 0.5], z: 0.27 } } } })
    const pose = parseCustomMotion({ name: 'minha_pose', template: { standing: true, props: { 'Hips.position': { x: 0, y: 1, z: 0 }, 'Spine.rotation': { x: 9, y: 0, z: 0 } } } })
    expect(pose).toMatchObject({ ok: true, motion: { kind: 'pose', props: { 'Spine.rotation': { x: Math.PI } } } })
  })

  it('refuses a motion with nothing valid, a bad name, or key frames out of order', () => {
    expect(parseCustomMotion({ bones: { tail: { x: 1 } } })).toMatchObject({ ok: false })
    expect(parseCustomMotion({ name: 'Bad Name', bones: { head: { frente: 1 } } })).toMatchObject({ ok: false })
    expect(parseCustomMotion({ keyframes: [{ t: 2, bones: { head: { frente: 1 } } }, { t: 1, bones: { head: { frente: 2 } } }] })).toMatchObject({ ok: false, reason: expect.stringContaining('time order') })
  })
})
