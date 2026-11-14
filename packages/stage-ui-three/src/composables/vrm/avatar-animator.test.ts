import type { AnimationClip } from 'three'

import type { AvatarAnimatorHooks } from './avatar-animator'

import { AdditiveAnimationBlendMode, AnimationClip as Clip, NumberKeyframeTrack, Object3D, QuaternionKeyframeTrack } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { AvatarAnimator } from './avatar-animator'

/** A clip that moves `position.x` of the root, so the mixer has a real track to blend. */
function clip(name: string, durationSeconds: number): AnimationClip {
  return new Clip(name, durationSeconds, [new NumberKeyframeTrack('.position[x]', [0, durationSeconds], [0, 1])])
}

function createAnimator(options: { clips?: Record<string, AnimationClip>, talking?: boolean, thinking?: boolean } = {}) {
  const clips = options.clips ?? { 'idle-b': clip('idle-b', 2) }
  const state = { talking: options.talking ?? false, thinking: options.thinking ?? false }
  const idleQueue = Object.keys(clips).filter(url => url.startsWith('idle'))
  const hooks: AvatarAnimatorHooks = {
    loadClip: vi.fn(async (url: string) => clips[url]),
    pickIdleUrl: () => idleQueue[0] ?? null,
    isTalking: () => state.talking,
    isThinking: () => state.thinking,
  }
  // random() = 0 makes every idle switch after exactly one loop.
  const animator = new AvatarAnimator(new Object3D(), hooks, () => 0)
  return { animator, hooks, state }
}

/** Lets resolved clip loads run their `then` callbacks. */
async function flushLoads() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('avatarAnimator', () => {
  it('plays the first idle at full weight without a fade', () => {
    const { animator } = createAnimator()
    animator.start(clip('idle-a', 2))
    animator.update(0)

    expect(animator.idle?.isRunning()).toBe(true)
    expect(animator.idle?.getEffectiveWeight()).toBeCloseTo(1, 5)
  })

  it('switches to the next idle after one loop and crossfades over 1.2 s on the frame clock', async () => {
    const { animator, hooks } = createAnimator()
    animator.start(clip('idle-a', 2))
    const first = animator.idle

    animator.update(1.9)
    expect(hooks.loadClip).not.toHaveBeenCalled()

    animator.update(0.2)
    expect(hooks.loadClip).toHaveBeenCalledWith('idle-b')
    await flushLoads()

    const second = animator.idle
    expect(second).not.toBe(first)

    animator.update(0.6)
    expect(first?.getEffectiveWeight()).toBeGreaterThan(0)
    expect(second?.getEffectiveWeight()).toBeGreaterThan(0)

    animator.update(0.7)
    expect(first?.getEffectiveWeight()).toBeCloseTo(0, 5)
    expect(second?.getEffectiveWeight()).toBeCloseTo(1, 5)
  })

  it('requests the next idle once while it loads, not on every frame', () => {
    const { animator, hooks } = createAnimator()
    animator.start(clip('idle-a', 1))

    animator.update(1.1)
    animator.update(0.016)
    animator.update(0.016)

    expect(hooks.loadClip).toHaveBeenCalledTimes(1)
  })

  it('waits with the idle switch while she talks', () => {
    const { animator, hooks } = createAnimator({ talking: true })
    animator.start(clip('idle-a', 1))

    animator.update(1.1)

    expect(hooks.loadClip).not.toHaveBeenCalled()
  })

  it('fades the talking clip in over 0.3 s and back to the idle', async () => {
    const { animator } = createAnimator({ clips: { 'talking': clip('talking', 1), 'idle-b': clip('idle-b', 2) } })
    animator.start(clip('idle-a', 10), 'talking')
    await flushLoads()
    const idle = animator.idle

    animator.setTalking(true)
    animator.update(0.3)

    expect(animator.talking?.getEffectiveWeight()).toBeCloseTo(1, 5)
    expect(idle?.getEffectiveWeight()).toBeCloseTo(0, 5)

    animator.setTalking(false)
    animator.update(0.3)

    expect(animator.talking?.getEffectiveWeight()).toBeCloseTo(0, 5)
    expect(idle?.getEffectiveWeight()).toBeCloseTo(1, 5)
  })

  it('plays an emote once at 1.5x and returns to the idle', () => {
    const { animator } = createAnimator()
    animator.start(clip('idle-a', 10))
    const idle = animator.idle
    const onFinished = vi.fn()

    animator.playEmote(clip('wave', 1.5), onFinished)
    const emote = animator.emote

    expect(animator.emotePlaying).toBe(true)
    expect(emote?.timeScale).toBe(1.5)

    // 1.5 s of clip at 1.5x ends after 1 s of frame time.
    animator.update(0.5)
    animator.update(0.55)

    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(animator.emotePlaying).toBe(false)

    animator.update(0.3)

    expect(emote?.getEffectiveWeight()).toBeCloseTo(0, 5)
    expect(idle?.getEffectiveWeight()).toBeCloseTo(1, 5)
  })

  it('does not switch the idle while an emote plays', () => {
    const { animator, hooks } = createAnimator()
    animator.start(clip('idle-a', 1))
    animator.playEmote(clip('long', 30))

    animator.update(1.1)

    expect(hooks.loadClip).not.toHaveBeenCalled()
  })

  it('ignores a clip that finishes loading after dispose', async () => {
    const { animator } = createAnimator()
    animator.start(clip('idle-a', 1))
    const idle = animator.idle

    animator.update(1.1)
    animator.dispose()
    await flushLoads()

    expect(animator.idle).toBe(idle)
  })

  it('brings the idle switch forward when asked, but never later', () => {
    const { animator, hooks } = createAnimator()
    animator.start(clip('idle-a', 10))

    animator.requestIdleSwitch(2)
    animator.update(1.9)
    expect(hooks.loadClip).not.toHaveBeenCalled()
    animator.update(0.2)
    expect(hooks.loadClip).toHaveBeenCalledTimes(1)
  })

  it('ignores a request that is later than the planned switch', () => {
    const { animator, hooks } = createAnimator()
    animator.start(clip('idle-a', 1))

    animator.requestIdleSwitch(30)
    animator.update(1.1)

    expect(hooks.loadClip).toHaveBeenCalledTimes(1)
  })
})

describe('avatarAnimator layers (V6)', () => {
  /** A clip with one rotation track for each node, so a mask has tracks to keep and to drop. */
  function bodyClip(name: string, durationSeconds: number) {
    return new Clip(name, durationSeconds, ['hips', 'leftHand', 'head'].map(node =>
      new QuaternionKeyframeTrack(`${node}.quaternion`, [0, durationSeconds], [0, 0, 0, 1, 0, 0.1, 0, 0.995])))
  }

  function bodyAnimator() {
    const root = new Object3D()
    for (const name of ['hips', 'leftHand', 'head']) {
      const node = new Object3D()
      node.name = name
      root.add(node)
    }
    const hooks: AvatarAnimatorHooks = {
      loadClip: vi.fn(),
      pickIdleUrl: () => null,
      isTalking: () => false,
      isThinking: () => false,
    }
    return new AvatarAnimator(root, hooks, () => 0)
  }

  it('plays a masked emote on its nodes while a copy of the idle keeps the other nodes', () => {
    const animator = bodyAnimator()
    animator.start(bodyClip('idle', 4))
    animator.update(1)
    const idleTime = animator.idle!.time

    animator.playEmote(bodyClip('wave', 1), undefined, { nodes: new Set(['leftHand']) })

    expect(animator.emote!.getClip().tracks.map(track => track.name)).toEqual(['leftHand.quaternion'])
    expect(animator.rest!.getClip().tracks.map(track => track.name)).toEqual(['hips.quaternion', 'head.quaternion'])
    expect(animator.rest!.time).toBeCloseTo(idleTime)
    expect(animator.emotePlaying).toBe(true)

    // The emote ends (1 s at 1.5x), and the idle comes back from the time of its copy.
    animator.update(1)
    animator.update(0.5)
    expect(animator.emotePlaying).toBe(false)
    expect(animator.rest).toBeNull()
    expect(animator.idle!.enabled).toBe(true)
    expect(animator.idle!.isRunning()).toBe(true)
  })

  it('plays an additive emote over the idle without stopping it', () => {
    const animator = bodyAnimator()
    animator.start(bodyClip('idle', 4))
    animator.update(0.5)

    animator.playEmote(bodyClip('nod', 1), undefined, { additive: true })

    expect(animator.overlays.size).toBe(1)
    const [overlay] = animator.overlays
    expect(overlay.blendMode).toBe(AdditiveAnimationBlendMode)
    expect(animator.emotePlaying).toBe(false)
    animator.update(0.3)
    expect(animator.idle!.getEffectiveWeight()).toBe(1)

    animator.update(1)
    expect(animator.overlays.size).toBe(0)
  })

  it('takes a different talking clip of the pool for each speech, and keeps a held pose while she speaks', async () => {
    const clips = { 'idle-b': clip('idle-b', 2), 'talk-0': clip('talk-0', 2), 'talk-1': clip('talk-1', 2) }
    const { animator, state } = createAnimator({ clips })
    animator.start(clip('idle-a', 2))
    animator.setTalkingPool(['talk-0', 'talk-1'])

    state.talking = true
    animator.setTalking(true)
    // The clip of the pool waits 0.9 s, so a one-word answer plays with the idle only.
    animator.update(0.5)
    await flushLoads()
    expect(animator.talking).toBeNull()
    animator.update(0.5)
    await flushLoads()
    animator.update(1)
    const first = animator.talking?.getClip().name
    // The talking clip adds a part of its motion to the idle, so she does not gesture with the full clip.
    expect(animator.idle?.getEffectiveWeight()).toBeCloseTo(1, 5)
    expect(animator.talking?.blendMode).toBe(AdditiveAnimationBlendMode)
    expect(animator.talking?.getEffectiveWeight()).toBeGreaterThanOrEqual(0.3)
    expect(animator.talking?.getEffectiveWeight()).toBeLessThanOrEqual(0.45)
    state.talking = false
    animator.setTalking(false)
    state.talking = true
    animator.setTalking(true)
    animator.update(1)
    await flushLoads()
    expect(animator.talking?.getClip().name).not.toBe(first)
    expect(['talk-0:additive', 'talk-1:additive']).toContain(first)

    state.talking = false
    animator.setTalking(false)
    animator.holdPose(clip('sitting', 1))
    state.talking = true
    animator.setTalking(true)
    animator.update(1)
    await flushLoads()
    animator.update(1)
    expect(animator.pose?.getClip().name).toBe('sitting')
    expect(animator.pose?.getEffectiveWeight()).toBeCloseTo(1, 2)
    expect(animator.talking?.isRunning() && animator.talking.getEffectiveWeight() > 0.5).toBeFalsy()
  })

  it('changes the talking clip of the pool during a long speech, from a random point of the clip', async () => {
    // ROOT CAUSE:
    //
    // Each speech played the same clip from its start, at the same weight, so every reply opened with the same arms.
    //
    // We fixed this with a random start point, a weight range, and a switch to another clip after 8 to 13 s.
    const clips = { 'idle-b': clip('idle-b', 2), 'talk-0': clip('talk-0', 4), 'talk-1': clip('talk-1', 4) }
    const random = vi.fn(() => 0.5)
    const hooks: AvatarAnimatorHooks = {
      loadClip: vi.fn(async (url: string) => clips[url as keyof typeof clips]),
      pickIdleUrl: () => null,
      isTalking: () => true,
      isThinking: () => false,
    }
    const animator = new AvatarAnimator(new Object3D(), hooks, random)
    animator.start(clip('idle-a', 2))
    animator.setTalkingPool(['talk-0', 'talk-1'])
    animator.setTalking(true)
    animator.update(1)
    await flushLoads()
    const first = animator.talking!
    // random() = 0.5 starts the 4 s clip at 2 s, before any frame of the mixer.
    expect(first.time).toBeCloseTo(2, 5)

    // After 10.5 s (the middle of 8 to 13 s) the other clip of the pool takes over.
    animator.update(10)
    await flushLoads()
    expect(animator.talking).toBe(first)
    animator.update(0.6)
    await flushLoads()
    expect(animator.talking).not.toBe(first)
    expect(animator.talking?.getClip().name).not.toBe(first.getClip().name)
  })

  it('goes back to the idle when the hold time of a pose ends', () => {
    // ROOT CAUSE:
    //
    // A pose stayed until the next pose, so she stayed sitting or thinking. In TalkingHead the mood idle replaces it.
    //
    // We fixed this with a hold time on the frame clock.
    const { animator } = createAnimator()
    animator.start(clip('idle-a', 2))
    animator.holdPose(clip('sitting', 1), 1, 10)

    animator.update(9)
    expect(animator.pose?.getClip().name).toBe('sitting')
    animator.update(1.5)
    expect(animator.pose).toBeNull()
    animator.update(1.5)
    expect(animator.idle?.getEffectiveWeight()).toBeCloseTo(1, 2)
  })

  it('gets up with the exit clip of a pose, forward, and reports a floor pose until the idle is back', () => {
    const { animator } = createAnimator()
    animator.start(clip('idle-a', 2))
    const idle = animator.idle!
    const lying = new Clip('lie-down', 6, [new NumberKeyframeTrack('.position[x]', [0, 3, 6], [0, 1, 1])])
    const getUp = clip('get-up', 2)

    animator.holdPoseClip(lying, { introSeconds: 3, holdSeconds: 1, exitClip: getUp })
    expect(animator.holdsClipPose).toBe(true)
    animator.update(3.1)
    animator.update(1.1)
    // The hold time ended: the get-up clip plays forward, not the entry backwards.
    expect(animator.pose).toBeNull()
    const exit = animator.mixer.clipAction(getUp)
    expect(exit.isRunning()).toBe(true)
    expect(exit.timeScale).toBe(1)
    expect(animator.holdsClipPose).toBe(true)
    animator.update(2.1)
    animator.update(1)
    expect(animator.holdsClipPose).toBe(false)
    expect(idle.getEffectiveWeight()).toBeCloseTo(1, 2)
  })

  it('holds a pose from a clip: the entry once, then the rest in a loop, and gets up backwards at the end', () => {
    const { animator } = createAnimator()
    animator.start(clip('idle-a', 2))
    const idle = animator.idle!
    // 3 s of entry (standing to lying), then 3 s of breathing in the pose.
    const lying = new Clip('lie-down', 6, [new NumberKeyframeTrack('.position[x]', [0, 3, 6], [0, 1, 1])])

    animator.holdPoseClip(lying, { introSeconds: 3, holdSeconds: 4 })
    const entry = animator.pose!
    expect(entry.getClip().name).toBe('lie-down:entry')
    expect(entry.getClip().duration).toBeCloseTo(3, 5)
    animator.update(1)
    expect(idle.getEffectiveWeight()).toBeLessThan(1)

    // The entry ends after 3 s and the loop takes the body. The hold time starts here.
    animator.update(2.1)
    const loop = animator.pose!
    expect(loop).not.toBe(entry)
    expect(loop.getClip().name).toBe('lie-down:hold')
    expect(loop.getClip().duration).toBeCloseTo(3, 5)
    animator.update(3)
    expect(animator.pose).toBe(loop)

    // The hold time ends: the entry plays backwards from its end, and the idle waits.
    animator.update(1.2)
    expect(animator.pose).toBeNull()
    expect(entry.isRunning()).toBe(true)
    expect(entry.timeScale).toBe(-1)
    animator.update(0.5)
    expect(idle.getEffectiveWeight()).toBeCloseTo(0, 5)
    // While she gets up, a speech does not start a talking clip over her.
    animator.setTalkingPool(['talk-0'])
    animator.setTalking(true)
    animator.update(1)
    expect(animator.talking).toBeNull()

    // After the 3 s of the entry backwards, the idle comes back.
    animator.update(1.6)
    animator.update(1)
    expect(idle.getEffectiveWeight()).toBeCloseTo(1, 2)
    expect(entry.getEffectiveWeight()).toBeCloseTo(0, 2)
  })

  it('holds a whole clip in a loop when the pose has no entry', () => {
    const { animator } = createAnimator()
    animator.start(clip('idle-a', 2))

    animator.holdPoseClip(clip('rest', 2), { introSeconds: 0, holdSeconds: 5 })
    animator.update(1)
    expect(animator.pose?.getClip().name).toBe('rest')
    expect(animator.pose?.getEffectiveWeight()).toBeCloseTo(1, 2)

    animator.update(4.1)
    expect(animator.pose).toBeNull()
  })

  it('plays a timed emote in a loop for its duration on the frame clock, then returns to the held pose', () => {
    const { animator } = createAnimator()
    animator.start(clip('idle-a', 2))
    animator.holdPose(clip('hip', 1))
    animator.update(1)

    animator.playEmote(clip('wave', 0.5), undefined, { durationSeconds: 2, fadeSeconds: 1 })
    animator.update(1.5)
    expect(animator.emotePlaying).toBe(true)
    expect(animator.emote?.isRunning()).toBe(true)

    animator.update(0.6)
    expect(animator.emotePlaying).toBe(false)
    animator.update(1)
    expect(animator.pose?.getEffectiveWeight()).toBeCloseTo(1, 2)
  })
})
