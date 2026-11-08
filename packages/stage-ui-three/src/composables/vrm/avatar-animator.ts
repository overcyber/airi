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
  /**
   * Plays the clip in a loop at its recorded speed for this long, then returns to the base, like the TalkingHead
   * `playAnimation` and `playGesture` of the mirror. Without it, the clip plays once at 1.5x.
   */
  durationSeconds?: number
  /** Fade in and out, in seconds. Default: 0.2 in and 0.3 out. TalkingHead fades gestures over 1 s. */
  fadeSeconds?: number
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

/**
 * Weight of a talking clip of the pool. It adds to the idle, so she gestures with half the arm motion of the
 * clip and the mouth stays the focus of the speech.
 */
const talkingOverlayWeight = 0.5

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
  /**
   * A held body pose, for example TalkingHead `sitting`. It replaces the idle and the talking clip until
   * {@link holdPose} releases it. Gestures play over it.
   */
  pose: AnimationAction | null = null
  /** Time left of the held pose on the frame clock. `null` holds it until the next pose. */
  private poseRemainingSeconds: number | null = null
  /** The emote of a timed play and its remaining time on the frame clock. */
  private timedEmote: { action: AnimationAction, remainingSeconds: number, finish: () => void } | null = null

  private talkingClip: AnimationClip | null = null
  private talkingPool: string[] = []
  private lastTalkingUrl: string | null = null
  /** The talking clip adds to the idle (a clip of the pool) instead of replacing it (the single talking clip). */
  private talkingIsOverlay = false
  private talkingToken = 0
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

  /**
   * Sets the talking clips that take turns. Each speech picks one that the last speech did not use, so she
   * gestures in a new way each time, as the TalkingHead avatar does with its talking animations.
   */
  setTalkingPool(urls: readonly string[]) {
    this.talkingPool = [...urls]
  }

  setTalking(speaking: boolean) {
    // A held pose stays while she speaks, for example she talks while sitting.
    if (this.pose)
      return
    if (speaking && this.talkingPool.length > 0) {
      this.startPooledTalking()
      return
    }
    if (!speaking)
      this.talkingToken++
    if (speaking && this.talkingClip) {
      this.talkingIsOverlay = false
      this.idle?.fadeOut(fadeSeconds.talkOrThink)
      if (!this.talking) {
        this.talking = this.mixer.clipAction(this.talkingClip)
        this.talking.setLoop(LoopRepeat, Infinity)
      }
      this.talking.reset().fadeIn(fadeSeconds.talkOrThink).play()
    }
    else if (!speaking) {
      this.talking?.fadeOut(fadeSeconds.talkOrThink)
      if (this.talkingIsOverlay)
        this.ensureIdle()
      else if (!this.emotePlaying)
        this.idle?.reset().fadeIn(fadeSeconds.talkOrThink).play()
    }
  }

  private startPooledTalking() {
    const others = this.talkingPool.filter(url => url !== this.lastTalkingUrl)
    const choices = others.length > 0 ? others : this.talkingPool
    const url = choices[Math.floor(this.random() * choices.length) % choices.length]
    const token = ++this.talkingToken
    this.hooks.loadClip(url)
      .then((clip) => {
        // The speech ended, a newer speech started, or something else holds the body.
        if (this.disposed || token !== this.talkingToken || !this.hooks.isTalking() || this.pose || this.emotePlaying)
          return
        this.lastTalkingUrl = url
        // The clip adds to the idle at half weight. The idle stays the base, so it must run, for example after thinking.
        const action = this.mixer.clipAction(additiveClip(clip))
        action.blendMode = AdditiveAnimationBlendMode
        action.setLoop(LoopRepeat, Infinity)
        action.weight = talkingOverlayWeight
        this.ensureIdle()
        if (this.talking && this.talking !== action)
          this.talking.fadeOut(fadeSeconds.talkOrThink)
        action.reset().fadeIn(fadeSeconds.talkOrThink).play()
        this.talking = action
        this.talkingIsOverlay = true
      })
      .catch(error => console.warn('[vrm-animator] talking clip failed to load, staying idle:', error))
  }

  startThinking(url: string) {
    if (this.thinking || this.pose)
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
    if (resumeIdle && !this.pose)
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
      this.playMasked(clip, options.nodes, onFinished, options)
      return
    }
    const fadeIn = options.fadeSeconds ?? fadeSeconds.emoteIn
    const fadeOut = options.fadeSeconds ?? fadeSeconds.emoteOut
    if (this.emote) {
      this.emote.fadeOut(fadeIn)
      this.emote = null
    }
    const base = this.baseAction()
    base?.fadeOut(fadeIn)
    if (base !== this.talking)
      this.talking?.fadeOut(fadeIn)
    const action = this.mixer.clipAction(clip)
    this.startEmoteAction(action, options, fadeIn)
    this.emote = action
    this.emotePlaying = true

    const finish = () => {
      if (this.emote === action) {
        this.emotePlaying = false
        this.emote = null
      }
      // clampWhenFinished keeps the last frame at full weight. Release it, or the
      // idle blends against it and the arms hang between two poses.
      action.fadeOut(fadeOut)
      const next = this.baseAction()
      if (next) {
        next.enabled = true
        next.reset().fadeIn(fadeOut).play()
      }
      // The talking clip of the pool adds to the idle, so it comes back over it while she still speaks.
      if (this.talkingIsOverlay && this.talking && this.hooks.isTalking() && !this.pose)
        this.talking.reset().fadeIn(fadeOut).play()
      onFinished?.()
    }
    this.whenDone(action, options, finish)
  }

  /**
   * Holds a body pose, like TalkingHead `setPoseFromTemplate`. `null` releases it, and the idle (or the talking
   * clip) comes back. Fades take `fade` seconds, 1 s like TalkingHead. With `holdSeconds`, the pose goes back to
   * the idle after that time on the frame clock. Without it, the pose stays until the next call.
   */
  holdPose(clip: AnimationClip | null, fade = 1, holdSeconds: number | null = null) {
    const previous = this.pose
    this.poseRemainingSeconds = clip ? holdSeconds : null
    if (!clip) {
      if (!previous)
        return
      this.pose = null
      previous.fadeOut(fade)
      if (!this.emotePlaying) {
        const next = this.baseAction()
        if (next) {
          next.enabled = true
          next.reset().fadeIn(fade).play()
        }
      }
      return
    }
    const action = this.mixer.clipAction(clip)
    action.setLoop(LoopRepeat, Infinity)
    if (previous && previous !== action)
      previous.fadeOut(fade)
    if (!previous) {
      this.idle?.fadeOut(fade)
      this.talking?.fadeOut(fade)
      this.thinking?.fadeOut(fade)
      this.thinking = null
    }
    this.pose = action
    if (!this.emotePlaying)
      action.reset().fadeIn(fade).play()
  }

  /** Starts an emote action: once at 1.5x, or in a loop for `durationSeconds` at the recorded speed. */
  private startEmoteAction(action: AnimationAction, options: EmotePlayOptions, fadeIn: number) {
    if (options.durationSeconds !== undefined) {
      action.setLoop(LoopRepeat, Infinity)
      action.clampWhenFinished = false
      action.timeScale = 1
    }
    else {
      action.setLoop(LoopOnce, 1)
      action.clampWhenFinished = true
      action.timeScale = emoteTimeScale
    }
    action.reset().fadeIn(fadeIn).play()
  }

  /** Runs `finish` once: when a one-shot emote ends, or when the time of a timed emote runs out. */
  private whenDone(action: AnimationAction, options: EmotePlayOptions, finish: () => void) {
    if (options.durationSeconds !== undefined) {
      if (this.timedEmote && this.timedEmote.action !== action)
        this.timedEmote = null
      this.timedEmote = { action, remainingSeconds: Math.max(0, options.durationSeconds), finish }
      return
    }
    const onDone = (event: { action: AnimationAction }) => {
      if (event.action !== action)
        return
      this.mixer.removeEventListener('finished', onDone)
      finish()
    }
    this.mixer.addEventListener('finished', onDone)
  }

  /** The action that holds the body when no emote plays: talking, or the idle. */
  private baseAction() {
    if (this.pose)
      return this.pose
    return this.hooks.isTalking() && this.talking && !this.talkingIsOverlay ? this.talking : this.idle
  }

  /** Fades the idle in when it does not hold the body now. A running idle goes on, so it does not jump to its start. */
  private ensureIdle() {
    const idle = this.idle
    if (!idle || this.emotePlaying || this.pose)
      return
    if (idle.enabled && idle.isRunning() && idle.getEffectiveWeight() > 0.99)
      return
    idle.reset().fadeIn(fadeSeconds.talkOrThink).play()
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
  private playMasked(clip: AnimationClip, nodes: ReadonlySet<string>, onFinished?: () => void, options: EmotePlayOptions = {}) {
    const fadeIn = options.fadeSeconds ?? fadeSeconds.emoteIn
    const fadeOut = options.fadeSeconds ?? fadeSeconds.emoteOut
    if (this.emote) {
      this.emote.fadeOut(fadeIn)
      this.emote = null
    }
    const base = this.baseAction()
    let rest: AnimationAction | null = null
    if (base) {
      rest = this.mixer.clipAction(maskClip(base.getClip(), nodes, 'drop'))
      if (rest !== this.rest) {
        this.rest?.fadeOut(fadeIn)
        rest.reset()
        rest.time = base.time
        rest.setEffectiveWeight(1).play()
      }
      base.fadeOut(fadeIn)
    }
    this.rest = rest
    const action = this.mixer.clipAction(maskClip(clip, nodes, 'keep'))
    this.startEmoteAction(action, options, fadeIn)
    this.emote = action
    this.emotePlaying = true

    const finish = () => {
      if (this.emote === action) {
        this.emotePlaying = false
        this.emote = null
      }
      action.fadeOut(fadeOut)
      const resting = this.rest
      this.rest = null
      // The base clip continues from the time of its copy, so the body does not jump.
      const next = this.baseAction()
      if (next) {
        // A finished fade-out disables the action. It must run again before it can fade in.
        next.enabled = true
        if (resting && resting.getClip().name === `${next.getClip().name}:drop`)
          next.time = resting.time
        next.fadeIn(fadeOut).play()
      }
      resting?.fadeOut(fadeOut)
      onFinished?.()
    }
    this.whenDone(action, options, finish)
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

    // A pose with a hold time goes back to the idle, like the mood idle of TalkingHead replaces a pose.
    if (this.pose && this.poseRemainingSeconds !== null) {
      this.poseRemainingSeconds -= deltaSeconds
      if (this.poseRemainingSeconds <= 0)
        this.holdPose(null)
    }

    const timed = this.timedEmote
    if (timed) {
      timed.remainingSeconds -= deltaSeconds
      if (timed.remainingSeconds <= 0) {
        this.timedEmote = null
        // A newer emote replaced it. Its own finish runs later.
        if (this.emote === timed.action)
          timed.finish()
      }
    }

    if (this.idleCycleRemainingSeconds === null)
      return
    this.idleCycleRemainingSeconds -= deltaSeconds
    if (this.idleCycleRemainingSeconds > 0)
      return

    const busy = this.hooks.isTalking() || this.hooks.isThinking() || this.emotePlaying || this.pose !== null
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
