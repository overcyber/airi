import { describe, expect, it, vi } from 'vitest'

import { createAvatarMotionTools } from './avatar-motion-tools'
import { neoAliceToolAllowlist } from './neoalice-tools'

describe('createAvatarMotionTools', () => {
  it('reads the rig, then checks, plays, and saves a motion that the LLM created', async () => {
    const play = vi.fn(() => true)
    const save = vi.fn(async () => true)
    const [rig, motion] = createAvatarMotionTools({ play, save })
    const context = { messages: [], toolCallId: 't1' }

    const data = await rig.execute({}, context) as { bones: Array<{ bone: string }> }
    expect(data.bones.some(bone => bone.bone === 'leftUpperArm')).toBe(true)

    const result = await motion.execute({ name: 'vitoria', kind: 'gesture', save: true, bones: { leftUpperArm: { levantar: 999 } } }, context)
    expect(result).toMatchObject({ ok: true, played: true, saved: true, warnings: [expect.stringContaining('clamped leftUpperArm.levantar')] })
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ name: 'vitoria', kind: 'gesture' }))
    expect(save).toHaveBeenCalledOnce()

    expect(await motion.execute({ bones: { tail: {} } }, context)).toMatchObject({ ok: false })
  })

  it('lets NeoAlice run the body tools with cmd/avatar/tool', () => {
    expect(neoAliceToolAllowlist).toEqual(expect.arrayContaining(['avatar_motion', 'avatar_rig']))
    expect(neoAliceToolAllowlist).not.toContain('computer_use')
  })
})
