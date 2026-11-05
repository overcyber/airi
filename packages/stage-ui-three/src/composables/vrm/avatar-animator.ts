// Ported from Utsuwa, src/lib/services/avatar/avatar-animator.ts
// https://github.com/JuiceBoxxGames/utsuwa (AGPL-3.0-or-later).
// Changes for AIRI: the idle cycle counts frame time instead of using setTimeout,
// photo mode and poses are removed, and the random source is injectable for tests.

import type { AnimationAction, AnimationClip, Object3D } from 'three'

import { AdditiveAnimationBlendMode, AnimationMixer, LoopOnce, LoopRepeat } from 'three'

import { additiveClip, maskClip } from './motion-layers'

/**
 * How an emote mixes with the body (V6).
 * - `nodes`: only these nodes play the emote. The base clip keeps every other node.
 * - `additive`: the emote adds to the current pose. Nothing else stops.
 */
export interface EmotePlayOptions {
  nodes?: ReadonlySet<string>
  additive?: boolean
}

export interface AvatarAnimatorHooks {
  /** Loads and retargets a VRMA clip for the model of this animator. */
  loadClip: (url: string) => Promise<AnimationClip>
  /** Next idle of the pool, or null when the pool is empty. */
  pickIdleUrl: () => string | null
  isTalking: () => boolean
  isThinking: () => boolean
}

/** Fade lengths in seconds. A slow idle fade reads as easing into a new stance, not a cut. */
const fadeSeconds = {
  idleToIdle: 1.2,
  talkOrThink: 0.3,
  emoteIn: 0.2,
  emoteOut: 0.3,
}

/** Emotes play faster than recorded, so a gesture reads as a quick reaction. */
const emoteTimeScale = 1.5

/**
 * Plays the body animation of one VRM model: a cycling idle pool, a talking clip,
 * an optional thinking clip, and one-shot emotes, all joined by weight crossfades.
 *
 * State model:
 * - `idle`, `talking`, `thinking`, and `emote` are the actions that hold weight now.
 * - `idleCycleRemainingSeconds` counts down on the frame clock in {@link update}.
 *   When it reaches 0 the next idle starts, unless talking, thinking, or an emote
 *   holds the stage. Then the countdown starts again.
 * - Async loads check `disposed` and their own token, so a load that finishes after
 *   a model switch or a newer request changes nothing.
 */
export class AvatarAnimator {
  readonly mixer: AnimationMixer
  idle: AnimationAction | null = null
  talking: AnimationAction | null = null
  thinking: AnimationAction | null = null
  emote: AnimationAction | null = null
  emotePlaying = false
  /** The base clip without the nodes of a masked emote, while that emote plays. */
  rest: AnimationAction | null = null
  /** Additive emotes that play now. They do not hold the stage. */
  readonly overlays = new Set<AnimationAction>()

  private talkingClip: AnimationClip | null = null
  private thinkingClip: { url: string, clip: AnimationClip } | null = null
  private thinkingToken = 0
  private idleToken = 0
  private idleCycleRemainingSeconds: number | null = null
  private idleClipDurationSeconds = 0
  private disposed = false

  // `hooks` is public and reassignable: a cached model instance gets the hooks of the
  // component that shows it, so the talking and thinking state come from the current props.
  constructor(
    root: Object3D,
    public hooks: AvatarAnimatorHooks,
    private readonly random: () => number = Math.random,
  ) {
    this.mixer = new AnimationMixer(root)
  }

  /**
   * Starts the first idle without a fade and loads the talking clip in the background.
   * The caller loads the first idle itself, so a model without any usable idle fails
   * before it is shown.
   */
  start(firstIdle: AnimationClip, talkingUrl?: string) {
    const action = this.mixer.clipAction(firstIdle)
    action.setLoop(LoopRepeat, Infinity)
    action.play()
    this.idle = action
    this.scheduleIdleCycle(firstIdle.duration)

    if (!talkingUrl)
      return
    this.hooks.loadClip(talkingUrl)
      .then((clip) => {
        if (!this.disposed)
          this.talkingClip = clip
      })
      .catch(error => console.error('[vrm-animator] talking clip failed to load:', error))
  }

  playNextIdle() {
    const url = this.hooks.pickIdleUrl()
    if (!url)
      return
    const token = ++this.idleToken
    // The countdown stops while the clip loads, so later frames do not request it again.
    this.idleCycleRemainingSeconds = null
    this.hooks.loadClip(url)
      .then((clip) => {
        if (this.disposed || token !== this.idleToken)
          return
        const action = this.mixer.clipAction(clip)
        action.setLoop(LoopRepeat, Infinity)
        if (action !== this.idle) {
          this.idle?.fadeOut(fadeSeconds.idleToIdle)
          action.reset().fadeIn(fadeSeconds.idleToIdle).play()
        }
        this.idle = action
        this.scheduleIdleCycle(clip.duration)
      })
      .catch((error) => {
        console.error('[vrm-animator] idle clip failed to load:', error)
        // Keep the current idle and try another one after the usual wait.
        if (!this.disposed && token === this.idleToken)
          this.scheduleIdleCycle(this.idleClipDurationSeconds)
      })
  }

  setTalking(speaking: boolean) {
    if (speaking && this.talkingClip) {
      this.idle?.fadeOut(fadeSeconds.talkOrThink)
      if (!this.talking) {
        this.talking = this.mixer.clipAction(this.talkingClip)
        this.talking.setLoop(LoopRepeat, Infinity)
      }
      this.talking.reset().fadeIn(fadeSeconds.talkOrThink).play()
    }
    else if (!speaking) {
      this.talking?.fadeOut(fadeSeconds.talkOrThink)
      if (!this.emotePlaying)
        this.idle?.reset().fadeIn(fadeSeconds.talkOrThink).play()
    }
  }

  startThinking(url: string) {
    if (this.thinking)
      return
    const token = ++this.thinkingToken
    const cached = this.thinkingClip?.url === url ? this.thinkingClip.clip : null
    ;(cached ? Promise.resolve(cached) : this.hooks.loadClip(url))
      .then((clip) => {
        // The model changed, thinking ended, or something else took the stage.
        if (this.disposed || token !== this.thinkingToken)
          return
        if (!this.hooks.isThinking() || this.emotePlaying)
          return
        this.thinkingClip = { url, clip }
        this.idle?.fadeOut(fadeSeconds.talkOrThink)
        const action = this.mixer.clipAction(clip)
        action.setLoop(LoopRepeat, Infinity)
        action.reset().fadeIn(fadeSeconds.talkOrThink).play()
        this.thinking = action
      })
      .catch(error => console.warn('[vrm-animator] thinking clip failed to load, staying idle:', error))
  }

  stopThinking(resumeIdle: boolean) {
    this.thinkingToken++
    if (!this.thinking)
      return
    this.thinking.fadeOut(fadeSeconds.talkOrThink)
    this.thinking = null
    if (resumeIdle)
      this.idle?.reset().fadeIn(fadeSeconds.talkOrThink).play()
  }

  /**
   * Plays a clip once at 1.5x, then returns to the idle. `onFinished` runs when it ends.
   *
   * With `options.additive`, the clip adds to the current pose: the idle and the speech go on.
   * With `options.nodes`, only those nodes play the clip: the base clip goes on for the others.
   * Without options, the whole body plays the clip, as before V6.
   */
  playEmote(clip: AnimationClip, onFinished?: () => void, options: EmotePlayOptions = {}) {
    if (options.additive) {
      this.playAdditive(clip, onFinished)
      return
    }
    if (options.nodes && options.nodes.size > 0) {
      this.playMasked(clip, options.nodes, onFinished)
      return
    }
    if (this.emote) {
      this.emote.fadeOut(fadeSeconds.emoteIn)
      this.emote = null
    }
    const idle = this.idle
    idle?.fadeOut(fadeSeconds.emoteIn)
    this.talking?.fadeOut(fadeSeconds.emoteIn)
    const action = this.mixer.clipAction(clip)
    action.setLoop(LoopOnce, 1)
    action.clampWhenFinished = true
    action.timeScale = emoteTimeScale
    action.reset().fadeIn(fadeSeconds.emoteIn).play()
    this.emote = action
    this.emotePlaying = true

    const onDone = (event: { action: AnimationAction }) => {
      if (event.action !== action)
        return
      this.mixer.removeEventListener('finished', onDone)
      if (this.emote === action) {
        this.emotePlaying = false
        this.emote = null
      }
      // clampWhenFinished keeps the last frame at full weight. Release it, or the
      // idle blends against it and the arms hang between two poses.
      action.fadeOut(fadeSeconds.emoteOut)
      if (this.hooks.isTalking() && this.talking)
        this.talking.reset().fadeIn(fadeSeconds.emoteOut).play()
      else
        idle?.reset().fadeIn(fadeSeconds.emoteOut).play()
      onFinished?.()
    }
    this.mixer.addEventListener('finished', onDone)
  }

  /** The action that holds the body when no emote plays: talking, or the idle. */
  private baseAction() {
    return this.hooks.isTalking() && this.talking ? this.talking : this.idle
  }

  private playAdditive(clip: AnimationClip, onFinished?: () => void) {
    const action = this.mixer.clipAction(additiveClip(clip))
    action.blendMode = AdditiveAnimationBlendMode
    action.setLoop(LoopOnce, 1)
    action.clampWhenFinished = false
    action.timeScale = emoteTimeScale
    action.reset().fadeIn(fadeSeconds.emoteIn).play()
    this.overlays.add(action)
    const onDone = (event: { action: AnimationAction }) => {
      if (event.action !== action)
        return
      this.mixer.removeEventListener('finished', onDone)
      this.overlays.delete(action)
      action.fadeOut(fadeSeconds.emoteOut)
      onFinished?.()
    }
    this.mixer.addEventListener('finished', onDone)
  }

  /**
   * The emote plays on `nodes`. The base clip moves to a copy without those nodes, at the same time,
   * so the rest of the body keeps breathing and shifting weight. The base comes back at the end.
   */
  private playMasked(clip: AnimationClip, nodes: ReadonlySet<string>, onFinished?: () => void) {
    if (this.emote) {
      this.emote.fadeOut(fadeSeconds.emoteIn)
      this.emote = null
    }
    const base = this.baseAction()
    let rest: AnimationAction | null = null
    if (base) {
      rest = this.mixer.clipAction(maskClip(base.getClip(), nodes, 'drop'))
      if (rest !== this.rest) {
        this.rest?.fadeOut(fadeSeconds.emoteIn)
        rest.reset()
        rest.time = base.time
        rest.setEffectiveWeight(1).play()
      }
      base.fadeOut(fadeSeconds.emoteIn)
    }
    this.rest = rest
    const action = this.mixer.clipAction(maskClip(clip, nodes, 'keep'))
    action.setLoop(LoopOnce, 1)
    action.clampWhenFinished = true
    action.timeScale = emoteTimeScale
    action.reset().fadeIn(fadeSeconds.emoteIn).play()
    this.emote = action
    this.emotePlaying = true

    const onDone = (event: { action: AnimationAction }) => {
      if (event.action !== action)
        return
      this.mixer.removeEventListener('finished', onDone)
      if (this.emote === action) {
        this.emotePlaying = false
        this.emote = null
      }
      action.fadeOut(fadeSeconds.emoteOut)
      const resting = this.rest
      this.rest = null
      // The base clip continues from the time of its copy, so the body does not jump.
      const next = this.baseAction()
      if (next) {
        // A finished fade-out disables the action. It must run again before it can fade in.
        next.enabled = true
        if (resting && resting.getClip().name === `${next.getClip().name}:drop`)
          next.time = resting.time
        next.fadeIn(fadeSeconds.emoteOut).play()
      }
      resting?.fadeOut(fadeSeconds.emoteOut)
      onFinished?.()
    }
    this.mixer.addEventListener('finished', onDone)
  }

  /**
   * Brings the next idle switch forward, for example right after speech ends, so she
   * does not stand still. A switch that is already sooner stays as it is.
   */
  requestIdleSwitch(afterSeconds: number) {
    if (this.idleCycleRemainingSeconds === null)
      return
    this.idleCycleRemainingSeconds = Math.min(this.idleCycleRemainingSeconds, afterSeconds)
  }

  /** Advances the mixer and the idle cycle by one frame of the render clock. */
  update(deltaSeconds: number) {
    this.mixer.update(deltaSeconds)

    if (this.idleCycleRemainingSeconds === null)
      return
    this.idleCycleRemainingSeconds -= deltaSeconds
    if (this.idleCycleRemainingSeconds > 0)
      return

    const busy = this.hooks.isTalking() || this.hooks.isThinking() || this.emotePlaying
    if (busy)
      this.scheduleIdleCycle(this.idleClipDurationSeconds)
    else
      this.playNextIdle()
  }

  dispose() {
    this.disposed = true
    this.idleCycleRemainingSeconds = null
    this.mixer.stopAllAction()
  }

  /** Switches after one to two full loops of the current idle. */
  private scheduleIdleCycle(clipDurationSeconds: number) {
    this.idleClipDurationSeconds = clipDurationSeconds
    this.idleCycleRemainingSeconds = clipDurationSeconds * (1 + this.random())
  }
}
