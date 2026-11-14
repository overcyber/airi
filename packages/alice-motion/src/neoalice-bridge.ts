import type { InferOutput } from 'valibot'

import type { MotionCatalog } from './catalog'
import type { MotionIntent, MotionSource } from './contracts'
import type { CustomMotion } from './custom-motion'
import type { ResolvedMood } from './mood-vocabulary'

import { array, boolean, fallback, finite, looseObject, maxLength, maxValue, minValue, nullable, number, optional, picklist, pipe, record, safeParse, string, unknown } from 'valibot'

import { maxMessageBytes, motionSources, parseMotionIntent } from './contracts'
import { parseCustomMotion } from './custom-motion'
import { resolveMood } from './mood-vocabulary'

/**
 * Translation of NeoAlice MQTT messages for the AIRI bridge, sprint S08.
 *
 * It reads the topics that the MagicMirror module reads today, with the same field
 * rules as its `node_helper.js`, and turns each message into one bridge event.
 * It has no MQTT client and never publishes: the bridge only listens, so NeoAlice
 * does not change. Every function here returns a result and never throws.
 */

const topicRoot = 'neoalice/v1'

/** Largest text payload. Speech audio is larger and has its own limit. */
const maxTextPayloadBytes = 64 * 1024
/** Largest audio payload, about 7 MB of WAV as base64. */
const maxAudioPayloadBytes = 10 * 1024 * 1024
/** Identical payloads on one topic within this window are one message, as in the mirror module. */
const repeatWindowMs = 2000

export type NeoAliceBridgeEvent
  = | { type: 'speech-text', site: string, text: string, lang?: string, sessionId?: string }
    | { type: 'speech-audio', site: string, audioBase64: string, text: string, sessionId?: string }
    | { type: 'speech-stop', site: string }
    | { type: 'user-speech', site: string, text: string }
    | { type: 'mood', site: string, mood: ResolvedMood, intensity?: number, origin: 'neoalice' | 'companion', bond?: NeoAliceBond }
    /** The bond of the companion state without a mood. */
    | { type: 'bond', site: string, bond: NeoAliceBond }
    | { type: 'intent', site: string, intent: MotionIntent, emoji?: string }
    /**
     * `cmd/avatar/animation`: an FBX or VRMA file to play on the whole body, like TalkingHead `playAnimation`.
     * `url` is the URL of the message, `name` a TalkingHead animation name. The stage resolves both.
     */
    | { type: 'animation', site: string, url?: string, name?: string, durationMs?: number }
    /** `cmd/avatar/widget` (Plan 07, W4): open, update, or close a widget of the desktop app. */
    | { type: 'widget', site: string, action: 'spawn' | 'update' | 'remove' | 'clear', widget?: string, id?: string, props: Record<string, unknown>, ttlSeconds?: number }
    /** `cmd/avatar/tool` (Plan 07, W4): run a permitted tool of the avatar. The stage answers with `evt/avatar/tool_result`. */
    | { type: 'tool', site: string, tool: string, args: Record<string, unknown>, requestId: string }
    /**
     * A camera of NeoAlice sees people (F5). `people` is above 0. `target` is the center of the largest person box,
     * from 0 to 1 in the camera image (x to the right, y down), when the message has `bbox`.
     */
    | { type: 'presence', site: string, people: number, camera?: string, target?: { x: number, y: number } }
    /**
     * The night mode of Alice (`evt/alice/night_mode`), for example after "boa noite". It is not the sleepy mood:
     * in the night mode the avatar lies down and closes the eyes until the mode ends.
     */
    | { type: 'night-mode', site: string, active: boolean }
    /** The face recognition greets someone by name, for example "Ola Ana" (F5). */
    | { type: 'greeting', site: string, text: string }
    /**
     * A pose or a movement that NeoAlice or an LLM created (`cmd/avatar/motion`, or `defineGesture` and
     * `definePose` of `cmd/avatar`), or a saved one played by name. `play` is `false` for a definition only.
     * `save` asks the companion service to keep it. `warnings` say what the check clamped or dropped.
     */
    | { type: 'custom-motion', site: string, motion: CustomMotion, play: boolean, save: boolean, warnings: string[] }
    /** The saved motions of the companion service (`evt/avatar/motions`, retained). */
    | { type: 'motion-library', site: string, motions: CustomMotion[] }
    /** `cmd/avatar` with `stop`: ends the pose, the gesture, the animation, or all of them. */
    | { type: 'stop-motion', site: string, what: 'pose' | 'gesture' | 'animation' | 'all' }
    | { type: 'ignored', topic: string, reason: string }

/**
 * The bond of Alice with her owner, from the companion state, from 0 to 1.
 * `warmth` is the mean of affection, comfort, and intimacy. `energy` is her energy.
 */
export interface NeoAliceBond {
  warmth: number
  trust: number
  energy: number
}

export interface NeoAliceTranslatorOptions {
  /** Site whose messages the AIRI reacts to, for example the site of the mirror. */
  site: string
  /** Reads every site. The mirror module calls it `acceptAnySite`. */
  acceptAnySite?: boolean
  /**
   * Site where NeoAlice publishes the mood and the avatar commands, when it is not `site`.
   * NeoAlice sends them to the mirror site (`magicmirror`), also for a separate avatar site.
   * The bridge reads only the mood and the avatar commands of this site, never its speech.
   */
  moodSite?: string
  /**
   * Plays the speech of the mood site too (`cmd/tts/audio`, `cmd/tts/say`, `cmd/tts/stop`). NeoAlice sends what
   * Alice says on her own, for example after a camera sees a person, to the active satellites and the mirror site.
   * Turn it on when this avatar is the mirror (it replaces the TalkingHead avatar), so it says the same.
   */
  moodSiteSpeech?: boolean
  /** Site where the companion service publishes its state and affect. Default: `companion`. */
  companionSite?: string
  /**
   * Reads the cameras of NeoAlice (F5): `evt/vision/detection(s)` of every site, and the greetings of
   * `facialSite`. The avatar looks at a person who arrives, and smiles and waves at a greeting.
   */
  vision?: boolean
  /** Site of the NeoAlice face recognition. Default: `facialrecog`. */
  facialSite?: string
  catalog: MotionCatalog
}

/** The actions of the mood site: mood and avatar commands, no speech. */
const moodActions = ['evt/mood', 'cmd/evt/mood', 'evt/alice/night_mode', 'cmd/avatar', 'cmd/avatar/motion', 'cmd/avatar/gesture', 'cmd/avatar/pose', 'cmd/avatar/animation', 'cmd/avatar/emoji', 'cmd/avatar/widget', 'cmd/avatar/tool']
/** The speech actions, read from the mood site with `moodSiteSpeech`. */
const speechActions = ['cmd/tts/say', 'cmd/tts/audio', 'cmd/tts/stop']
/** The same speech on two sites (a broadcast) within this window plays once. */
const sameSpeechWindowMs = 30_000

/** The topics to subscribe to. All of them are read-only for the bridge. */
export function neoAliceBridgeTopics(options: Pick<NeoAliceTranslatorOptions, 'site' | 'acceptAnySite' | 'companionSite' | 'moodSite' | 'moodSiteSpeech' | 'vision' | 'facialSite'>) {
  const site = options.acceptAnySite ? '+' : options.site
  const companionSite = options.companionSite ?? 'companion'
  const moodSite = options.moodSite?.trim()
  const moodTopics = !options.acceptAnySite && moodSite && moodSite !== options.site
    ? [...moodActions, ...(options.moodSiteSpeech ? speechActions : [])].map(action => `${topicRoot}/${moodSite}/${action}`)
    : []
  return [
    ...moodTopics,
    `${topicRoot}/${site}/cmd/tts/say`,
    `${topicRoot}/${site}/cmd/tts/audio`,
    `${topicRoot}/${site}/cmd/tts/stop`,
    `${topicRoot}/${site}/evt/stt/final`,
    `${topicRoot}/${site}/evt/mood`,
    `${topicRoot}/${site}/cmd/evt/mood`,
    `${topicRoot}/${site}/evt/alice/night_mode`,
    `${topicRoot}/${site}/cmd/avatar/gesture`,
    `${topicRoot}/${site}/cmd/avatar/pose`,
    `${topicRoot}/${site}/cmd/avatar/animation`,
    `${topicRoot}/${site}/cmd/avatar/emoji`,
    `${topicRoot}/${site}/cmd/avatar/widget`,
    `${topicRoot}/${site}/cmd/avatar/tool`,
    `${topicRoot}/${site}/cmd/avatar`,
    `${topicRoot}/${site}/cmd/avatar/motion`,
    `${topicRoot}/${companionSite}/evt/companion/state`,
    `${topicRoot}/${companionSite}/evt/avatar/motions`,
    `${topicRoot}/${companionSite}/evt/companion/affect`,
    ...(options.vision
      ? [
          `${topicRoot}/+/evt/vision/detection`,
          `${topicRoot}/+/evt/vision/detections`,
          `${topicRoot}/${options.facialSite || 'facialrecog'}/evt/stt/final`,
        ]
      : []),
  ]
}

const Text = fallback(optional(pipe(string(), maxLength(8000))), undefined)
const Name = fallback(optional(pipe(string(), maxLength(64))), undefined)
const Seconds = fallback(optional(pipe(number(), finite(), minValue(0), maxValue(60))), undefined)
const Percent = fallback(optional(pipe(number(), finite(), minValue(0), maxValue(100))), undefined)

/** The NeoAlice YOLO class of a person. */
const personClass = 'person'
/** A box from 0 to 1: `x` and `y` are the top left corner, `w` and `h` the size. */
const BoxValue = pipe(number(), finite(), minValue(0), maxValue(1))
const VisionBox = looseObject({ x: BoxValue, y: BoxValue, w: BoxValue, h: BoxValue })
const VisionObject = looseObject({ class: Name, class_name: Name, bbox: fallback(optional(VisionBox), undefined) })
const VisionPayload = looseObject({
  camera: Name,
  detection: fallback(optional(looseObject({ camera: Name, objects: fallback(optional(array(VisionObject)), undefined) })), undefined),
  detections: fallback(optional(array(VisionObject)), undefined),
})

const SpeechPayload = looseObject({
  text: Text,
  lang: Name,
  tts: fallback(optional(looseObject({ text: Text, lang: Name })), undefined),
  stt: fallback(optional(looseObject({ text: Text })), undefined),
  session_id: fallback(optional(pipe(string(), maxLength(128))), undefined),
  audio: fallback(optional(looseObject({ b64: fallback(optional(string()), undefined) })), undefined),
  audio_base64: fallback(optional(string()), undefined),
})

/** `{"active": true}`. `enabled`, `night_mode`, and `state` (`on` or `off`) are read too. */
const NightModePayload = looseObject({
  active: fallback(optional(boolean()), undefined),
  enabled: fallback(optional(boolean()), undefined),
  night_mode: fallback(optional(boolean()), undefined),
  state: Name,
})

const MoodPayload = looseObject({
  mood: Name,
  state: fallback(optional(looseObject({ mood: Name })), undefined),
  intensity: Percent,
})

const AvatarPayload = looseObject({
  gesture: Name,
  name: Name,
  pose: Name,
  url: fallback(optional(pipe(string(), maxLength(2048))), undefined),
  emoji: fallback(optional(pipe(string(), maxLength(16))), undefined),
  duration: Seconds,
  source: Name,
  /** A one-hand gesture with the other hand, as in TalkingHead `playGesture(name, dur, mirror)`. */
  mirror: fallback(optional(boolean()), undefined),
})

const CompanionMood = looseObject({
  primary: Name,
  airiEmotion: Name,
  intensity: fallback(optional(Percent), undefined),
})
const Metric = fallback(optional(pipe(number(), finite())), undefined)
const CompanionStatePayload = looseObject({
  mood: fallback(optional(nullable(CompanionMood)), undefined),
  metrics: fallback(optional(looseObject({ affection: Metric, trust: Metric, intimacy: Metric, comfort: Metric })), undefined),
  energy: fallback(optional(looseObject({ value: Metric })), undefined),
})

/** The bond of a companion state, or `undefined` without metrics. Affection is 0 to 1000, the others 0 to 100. */
function bondOf(state: InferOutput<typeof CompanionStatePayload>): NeoAliceBond | undefined {
  const metrics = state.metrics
  if (!metrics)
    return undefined
  const unit = (value: number | undefined, scale: number) => Math.min(1, Math.max(0, (value ?? 0) / scale))
  const round = (value: number) => Math.round(value * 1000) / 1000
  return {
    warmth: round((unit(metrics.affection, 1000) + unit(metrics.comfort, 100) + unit(metrics.intimacy, 100)) / 3),
    trust: round(unit(metrics.trust, 100)),
    energy: round(state.energy?.value === undefined ? 0.7 : unit(state.energy.value, 100)),
  }
}
const CompanionAffectPayload = looseObject({ emotion: Name, airiEmotion: Name, intensity: fallback(optional(Percent), undefined) })

/**
 * Other names of the old mirror for the same motion. `dance` was a still FBX pose of the TalkingHead page that the
 * MQTT path never played. Here it is the dance animation of the mirror, Rumba.
 */
const motionAliases: Record<string, string> = {
  dance: 'rumba',
  dancar: 'rumba',
  armsopen: 'arms_open',
  twoknees: 'kneel',
}

/** The animations of the old mirror by name (`ANIMATIONS` of `neoalice_moves.mjs`), lower case without `_`. */
const oldMirrorAnimations = new Set(['idle', 'talk', 'explain', 'emphatic', 'rumba', 'laugh', 'angry', 'cry', 'fear', 'nod', 'shake', 'lookaround', 'breathe', 'walking'])

function aliasOf(name: string | undefined) {
  return name ? motionAliases[name] ?? name : undefined
}

/**
 * Stateful translator: it remembers recent payloads to drop repeats and numbers the intents.
 *
 * Before: a topic, its payload text, and the receive time.
 * After: one event. A broken, foreign, repeated, or unknown message is an `ignored` event with a reason.
 */
export class NeoAliceTranslator {
  private readonly options: NeoAliceTranslatorOptions
  private catalog: MotionCatalog
  private readonly companionSite: string
  private readonly recent = new Map<string, { payload: string, atMs: number }>()
  /** Speech that played, by session or text, so a broadcast to two read sites plays once. */
  private readonly recentSpeech = new Map<string, { atMs: number, site: string }>()
  private sequence = 0
  /**
   * Marks the intents of this translator. A new MQTT connection makes a new translator, and the stage scheduler
   * refuses an intent ID that it saw in the last 10 min. Without the mark, the numbers start again at 1 and the
   * first commands after a reconnection were dropped as "already received".
   */
  /** Saved motions by name, from the companion service and from `defineGesture` and `definePose`. */
  private readonly customMotions = new Map<string, CustomMotion>()
  private readonly connectionMark = Math.floor(Math.random() * 36 ** 6).toString(36)

  constructor(options: NeoAliceTranslatorOptions) {
    this.options = options
    this.catalog = options.catalog
    this.companionSite = options.companionSite ?? 'companion'
  }

  /** The saved motion of a name, for `{"pose": name}` and `{"gesture": name}`. */
  customMotion(name: string) {
    return this.customMotions.get(name)
  }

  /** Replaces the catalog, for example after the user imports an FBX animation with the name of a NeoAlice file. */
  setCatalog(catalog: MotionCatalog) {
    this.catalog = catalog
  }

  translate(topic: string, payload: string, nowMs: number): NeoAliceBridgeEvent {
    const parts = topic.split('/')
    if (parts.length < 4 || parts[0] !== 'neoalice' || parts[1] !== 'v1')
      return ignored(topic, 'not a NeoAlice v1 topic')
    const site = parts[2]
    const action = parts.slice(3).join('/')
    const isAudio = action === 'cmd/tts/audio'
    const limit = isAudio ? maxAudioPayloadBytes : maxTextPayloadBytes
    if (payload.length > limit)
      return ignored(topic, `payload is larger than ${limit} bytes`)

    if (site === this.companionSite)
      return this.translateCompanion(topic, site, action, payload)
    if (this.options.vision && (action === 'evt/vision/detection' || action === 'evt/vision/detections'))
      return translateVision(topic, site, payload)
    if (this.options.vision && site === (this.options.facialSite || 'facialrecog') && action === 'evt/stt/final') {
      const parsed = safeParse(SpeechPayload, parseJson(payload))
      const text = parsed.success ? parsed.output.stt?.text ?? parsed.output.text : undefined
      return text?.trim() ? { type: 'greeting', site, text: text.trim() } : ignored(topic, 'no greeting text')
    }
    const fromMoodSite = !!this.options.moodSite && site === this.options.moodSite
      && (moodActions.includes(action) || (!!this.options.moodSiteSpeech && speechActions.includes(action)))
    if (!this.options.acceptAnySite && site !== this.options.site && !fromMoodSite)
      return ignored(topic, `site "${site}" is not the bridge site`)

    const previous = this.recent.get(topic)
    if (previous && previous.payload === payload && nowMs - previous.atMs < repeatWindowMs)
      return ignored(topic, 'repeated payload')
    this.recent.set(topic, { payload, atMs: nowMs })

    const data = parseJson(payload)
    if (data === undefined)
      return ignored(topic, 'payload is not JSON')

    switch (action) {
      case 'cmd/tts/say':
      case 'cmd/tts/audio':
        return this.translateSpeech(topic, site, isAudio, data, nowMs)
      case 'cmd/tts/stop':
        return { type: 'speech-stop', site }
      case 'evt/stt/final': {
        // The v1 message of NeoAlice has the text in `stt.text`. Older senders put it in `text`.
        const parsed = safeParse(SpeechPayload, data)
        const text = parsed.success ? parsed.output.stt?.text ?? parsed.output.text : undefined
        return text ? { type: 'user-speech', site, text } : ignored(topic, 'no text')
      }
      case 'evt/mood':
      case 'cmd/evt/mood': {
        const parsed = safeParse(MoodPayload, data)
        const name = parsed.success ? parsed.output.mood ?? parsed.output.state?.mood : undefined
        if (!name)
          return ignored(topic, 'no mood')
        return { type: 'mood', site, mood: resolveMood(name), intensity: toUnit(parsed.success ? parsed.output.intensity : undefined), origin: 'neoalice' }
      }
      case 'evt/alice/night_mode': {
        const parsed = safeParse(NightModePayload, data)
        const state = parsed.success ? parsed.output.state?.trim().toLowerCase() : undefined
        const active = parsed.success
          ? parsed.output.active ?? parsed.output.enabled ?? parsed.output.night_mode ?? (state === 'on' ? true : state === 'off' ? false : undefined)
          : undefined
        return active === undefined ? ignored(topic, 'no night mode state') : { type: 'night-mode', site, active }
      }
      case 'cmd/avatar/animation':
        return translateAnimation(topic, site, data)
      case 'cmd/avatar/motion':
        return this.translateMotion(topic, site, data, true)
      case 'cmd/avatar':
        return this.translateCommand(topic, site, data, payload)
      case 'cmd/avatar/widget':
        return translateWidget(topic, site, data)
      case 'cmd/avatar/tool':
        return translateTool(topic, site, data)
      case 'cmd/avatar/gesture':
      case 'cmd/avatar/pose':
      case 'cmd/avatar/emoji':
        return this.translateAvatar(topic, site, action, data, payload)
      default:
        return ignored(topic, `topic "${action}" is not read by the bridge`)
    }
  }

  private translateSpeech(topic: string, site: string, isAudio: boolean, data: unknown, nowMs: number): NeoAliceBridgeEvent {
    const parsed = safeParse(SpeechPayload, data)
    if (!parsed.success)
      return ignored(topic, 'speech payload is not an object')
    const text = parsed.output.tts?.text ?? parsed.output.text ?? ''
    const sessionId = parsed.output.session_id || undefined
    // NeoAlice sends the same speech to the mirror, the avatar site, and the satellites, sometimes with a session id per
    // site. The session id or the text, seen on another site within the window, marks the copy.
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ')
    const keys = [sessionId && `session:${sessionId}`, normalized && `text:${normalized}`].filter((key): key is string => !!key)
    for (const [seen, entry] of this.recentSpeech) {
      if (nowMs - entry.atMs > sameSpeechWindowMs)
        this.recentSpeech.delete(seen)
    }
    if (keys.some(key => this.recentSpeech.get(key) && this.recentSpeech.get(key)!.site !== site))
      return ignored(topic, 'the same speech came on another site')
    for (const key of keys)
      this.recentSpeech.set(key, { atMs: nowMs, site })
    if (isAudio) {
      const audioBase64 = parsed.output.audio?.b64 ?? parsed.output.audio_base64
      if (!audioBase64)
        return ignored(topic, 'no audio')
      return { type: 'speech-audio', site, audioBase64, text, ...(sessionId && { sessionId }) }
    }
    if (!text.trim())
      return ignored(topic, 'no text')
    const lang = parsed.output.lang ?? parsed.output.tts?.lang
    return { type: 'speech-text', site, text, ...(lang && { lang }), ...(sessionId && { sessionId }) }
  }

  private translateAvatar(topic: string, site: string, action: string, data: unknown, payload: string): NeoAliceBridgeEvent {
    // An avatar command becomes a motion intent, so it has the motion message limit of the accepted ADR.
    if (new TextEncoder().encode(payload).length > maxMessageBytes)
      return ignored(topic, `message is larger than ${maxMessageBytes} bytes`)
    const parsed = safeParse(AvatarPayload, data)
    if (!parsed.success)
      return ignored(topic, 'avatar payload is not an object')
    const command = parsed.output
    const source: MotionSource = (motionSources as readonly string[]).includes(command.source ?? '') ? command.source as MotionSource : 'llm'
    const durationMs = command.duration !== undefined ? Math.round(command.duration * 1000) : undefined

    let semanticAction: string | undefined
    let extra: Partial<MotionIntent> = {}
    let emoji: string | undefined
    switch (action) {
      case 'cmd/avatar/gesture': {
        const name = aliasOf(normalizeName(command.gesture ?? command.name))
        const gesture = name && (command.mirror ? this.known(`gesture_${name}_mirror`) : undefined)
        semanticAction = gesture || (name && this.known(`gesture_${name}`))
        break
      }
      case 'cmd/avatar/pose': {
        const name = aliasOf(normalizeName(command.pose ?? command.name))
        semanticAction = name && this.known(`pose_${name}`)
        extra = { requestedChannels: ['posture'] }
        // NeoAlice also sends a gesture as a pose, for example `namaste`. It plays as that gesture, held for the
        // time of the command, or 10 s like a pose without one.
        const gesture = !semanticAction && name ? this.known(`gesture_${name}`) : undefined
        if (gesture) {
          semanticAction = gesture
          extra = { requestedDurationMs: Math.min(60_000, durationMs && durationMs > 0 ? durationMs : 10_000) }
        }
        break
      }
      default:
        emoji = command.emoji
        semanticAction = emoji ? 'emoji' : undefined
        extra = { requestedChannels: ['facial'] }
        break
    }
    if (!semanticAction) {
      const motionName = aliasOf(normalizeName(command.pose ?? command.gesture ?? command.name))
      // A motion that NeoAlice created and saved plays by its name, as a pose or as a gesture.
      const saved = action !== 'cmd/avatar/emoji' ? this.customMotions.get(motionName ?? '') : undefined
      if (saved) {
        const kind = action === 'cmd/avatar/pose' ? 'pose' : saved.kind
        const duration = command.duration !== undefined && command.duration > 0 ? Math.min(60, command.duration) : saved.duration
        return { type: 'custom-motion', site, motion: { ...saved, kind, duration, mirror: command.mirror ?? saved.mirror }, play: true, save: false, warnings: [] }
      }
      // An animation file by name, for example `{"pose":"rumba"}` or `{"gesture":"Wave_Hello"}`: the animations of the
      // old mirror and the files of the server. It loops for the time of the command, like `cmd/avatar/animation`.
      if (action !== 'cmd/avatar/emoji' && motionName && (oldMirrorAnimations.has(motionName.replace(/_/g, '')) || this.known(motionName))) {
        const seconds = command.duration !== undefined && command.duration > 0 ? command.duration : action === 'cmd/avatar/pose' ? 10 : 4
        return { type: 'animation', site, name: motionName, durationMs: Math.round(Math.min(60, seconds) * 1000) }
      }
      return ignored(topic, 'the catalog has no action for this command')
    }

    this.sequence++
    const candidate: MotionIntent = {
      schemaVersion: 1,
      id: `neoalice-${this.connectionMark}-${this.sequence}-${site}`.slice(0, 128),
      timestampMs: 0,
      source,
      semanticAction,
      ...(durationMs !== undefined && durationMs > 0 && { requestedDurationMs: Math.min(60_000, durationMs) }),
      ...extra,
    }
    const result = parseMotionIntent(candidate, { allowedActions: this.catalog.actions })
    if (!result.ok)
      return ignored(topic, result.reason)
    return { type: 'intent', site, intent: result.value, ...(emoji && { emoji }) }
  }

  private translateCompanion(topic: string, site: string, action: string, payload: string): NeoAliceBridgeEvent {
    const data = parseJson(payload)
    if (data === undefined)
      return ignored(topic, 'payload is not JSON')
    if (action === 'evt/companion/state') {
      const parsed = safeParse(CompanionStatePayload, data)
      if (!parsed.success)
        return ignored(topic, 'companion state is not an object')
      const mood = parsed.output.mood
      const bond = bondOf(parsed.output)
      if (!mood?.primary)
        return bond ? { type: 'bond', site, bond } : ignored(topic, 'no mood and no metrics in the companion state')
      return { type: 'mood', site, mood: resolveMood(mood.primary), intensity: toUnit(mood.intensity ?? undefined), origin: 'companion', ...(bond && { bond }) }
    }
    if (action === 'evt/avatar/motions') {
      const list = safeParse(looseObject({ motions: array(unknown()) }), data)
      if (!list.success)
        return ignored(topic, 'no motions list')
      const motions = list.output.motions.flatMap((item) => {
        const parsed = parseCustomMotion(item)
        return parsed.ok && parsed.motion.name ? [parsed.motion] : []
      })
      this.customMotions.clear()
      for (const motion of motions)
        this.customMotions.set(motion.name!, motion)
      return { type: 'motion-library', site, motions }
    }
    if (action === 'evt/companion/affect') {
      const parsed = safeParse(CompanionAffectPayload, data)
      const name = parsed.success ? parsed.output.emotion ?? parsed.output.airiEmotion : undefined
      if (!name)
        return ignored(topic, 'no emotion in the companion affect')
      return { type: 'mood', site, mood: resolveMood(name), intensity: toUnit(parsed.success ? parsed.output.intensity : undefined), origin: 'companion' }
    }
    return ignored(topic, `companion topic "${action}" is not read by the bridge`)
  }

  /** `cmd/avatar/motion`: a motion to check and play. A named one with `save` is kept by the companion service. */
  private translateMotion(topic: string, site: string, data: unknown, play: boolean): NeoAliceBridgeEvent {
    const parsed = parseCustomMotion(data)
    if (!parsed.ok)
      return ignored(topic, parsed.reason)
    if (parsed.motion.name)
      this.customMotions.set(parsed.motion.name, parsed.motion)
    return { type: 'custom-motion', site, motion: parsed.motion, play, save: parsed.save, warnings: parsed.warnings }
  }

  /**
   * `cmd/avatar`: the command format of the old mirror (`runAvatarCommand` of `neoalice_moves.mjs`), one
   * `{"action": ...}` per message. Gestures, poses, animations and moods take the same path as their own topics.
   */
  private translateCommand(topic: string, site: string, data: unknown, payload: string): NeoAliceBridgeEvent {
    const parsed = safeParse(looseObject({ action: Name, name: Name, dur: Seconds, mirror: fallback(optional(boolean()), undefined), url: fallback(optional(pipe(string(), maxLength(2048))), undefined), what: Name, values: fallback(optional(record(string(), unknown())), undefined), template: fallback(optional(record(string(), unknown())), undefined) }), data)
    if (!parsed.success || !parsed.output.action)
      return ignored(topic, 'cmd/avatar needs an action')
    const command = parsed.output
    switch (command.action) {
      case 'gesture':
        return this.translateAvatar(topic, site, 'cmd/avatar/gesture', { gesture: command.name, duration: command.dur, mirror: command.mirror }, payload)
      case 'pose':
        return this.translateAvatar(topic, site, 'cmd/avatar/pose', { pose: command.name, duration: command.dur }, payload)
      case 'animation':
        return translateAnimation(topic, site, { name: command.name, url: command.url, duration: command.dur })
      case 'mood':
        return command.name ? { type: 'mood', site, mood: resolveMood(command.name), origin: 'neoalice' } : ignored(topic, 'no mood')
      case 'face':
        return this.translateMotion(topic, site, { face: command.values ?? {}, duration: command.dur ?? 3 }, true)
      case 'stop': {
        const what = command.what === 'pose' || command.what === 'gesture' || command.what === 'animation' ? command.what : 'all'
        return { type: 'stop-motion', site, what }
      }
      case 'defineGesture':
      case 'definePose':
        return this.translateMotion(topic, site, { name: normalizeName(command.name), template: command.template, kind: command.action === 'definePose' ? 'pose' : 'gesture', save: true }, false)
      default:
        return ignored(topic, `cmd/avatar action "${command.action}" is not read by the bridge`)
    }
  }

  private known(semanticAction: string) {
    return this.catalog.get(semanticAction) ? semanticAction : undefined
  }
}

const WidgetPayload = looseObject({
  action: fallback(optional(picklist(['spawn', 'update', 'remove', 'clear'])), undefined),
  widget: Name,
  id: Name,
  props: fallback(optional(record(string(), unknown())), undefined),
  ttl_s: fallback(optional(pipe(number(), finite(), minValue(0), maxValue(3600))), undefined),
})

const ToolPayload = looseObject({
  tool: Name,
  args: fallback(optional(record(string(), unknown())), undefined),
  request_id: fallback(optional(pipe(string(), maxLength(128))), undefined),
})

/** `cmd/avatar/widget`: `{"action": "spawn", "widget": "weather", "props": {...}, "ttl_s": 30}`. */
function translateWidget(topic: string, site: string, data: unknown): NeoAliceBridgeEvent {
  const parsed = safeParse(WidgetPayload, data)
  if (!parsed.success || !parsed.output.action)
    return ignored(topic, 'no widget action')
  const { action, widget, id, props, ttl_s: ttl } = parsed.output
  if (action === 'spawn' && !widget)
    return ignored(topic, 'a widget spawn needs a widget name')
  if ((action === 'update' || action === 'remove') && !id)
    return ignored(topic, `a widget ${action} needs an id`)
  return { type: 'widget', site, action, ...(widget && { widget }), ...(id && { id }), props: props ?? {}, ...(ttl !== undefined && { ttlSeconds: ttl }) }
}

/** `cmd/avatar/tool`: `{"tool": "get_weather", "args": {...}, "request_id": "..."}`. */
function translateTool(topic: string, site: string, data: unknown): NeoAliceBridgeEvent {
  const parsed = safeParse(ToolPayload, data)
  if (!parsed.success || !parsed.output.tool)
    return ignored(topic, 'no tool name')
  return { type: 'tool', site, tool: parsed.output.tool, args: parsed.output.args ?? {}, requestId: parsed.output.request_id || `tool-${Date.now()}` }
}

/** `cmd/avatar/animation`: `{"url": "...", "duration": 5}` of the mirror, or `{"name": "Wave"}`. */
function translateAnimation(topic: string, site: string, data: unknown): NeoAliceBridgeEvent {
  const parsed = safeParse(AvatarPayload, data)
  if (!parsed.success)
    return ignored(topic, 'animation payload is not an object')
  const { url, name, duration } = parsed.output
  if (!url && !name)
    return ignored(topic, 'no animation url or name')
  return {
    type: 'animation',
    site,
    ...(url && { url }),
    ...(name && { name }),
    ...(duration !== undefined && duration > 0 && { durationMs: Math.round(duration * 1000) }),
  }
}

/** A vision message of NeoAlice, in the `detection` (core) or the `detections` (camera satellite) form. */
function translateVision(topic: string, site: string, payload: string): NeoAliceBridgeEvent {
  const parsed = safeParse(VisionPayload, parseJson(payload))
  if (!parsed.success)
    return ignored(topic, 'vision payload is not an object')
  const objects = parsed.output.detection?.objects ?? parsed.output.detections ?? []
  const persons = objects.filter(object => (object.class ?? object.class_name) === personClass)
  if (persons.length === 0)
    return ignored(topic, 'no person in the vision message')
  const camera = parsed.output.detection?.camera ?? parsed.output.camera
  // The avatar looks at the largest person box, that is, the person nearest to the camera.
  const boxes = persons.flatMap(person => person.bbox ? [person.bbox] : [])
  const box = boxes.sort((a, b) => b.w * b.h - a.w * a.h)[0]
  const target = box ? { x: Math.min(1, box.x + box.w / 2), y: Math.min(1, box.y + box.h / 2) } : undefined
  return { type: 'presence', site, people: persons.length, ...(camera && { camera }), ...(target && { target }) }
}

function ignored(topic: string, reason: string): NeoAliceBridgeEvent {
  return { type: 'ignored', topic, reason }
}

function parseJson(payload: string): unknown {
  try {
    return JSON.parse(payload)
  }
  catch {
    return undefined
  }
}

function normalizeName(value: string | undefined) {
  const name = value?.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return name || undefined
}

/** NeoAlice and the companion send intensity on a 0 to 100 scale. Motion uses 0 to 1. */
function toUnit(percent: number | undefined) {
  return percent === undefined ? undefined : Math.round(percent * 10) / 1000
}
