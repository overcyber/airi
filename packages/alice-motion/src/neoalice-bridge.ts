import type { InferOutput } from 'valibot'

import type { MotionCatalog } from './catalog'
import type { MotionIntent, MotionSource } from './contracts'
import type { ResolvedMood } from './mood-vocabulary'

import { array, boolean, fallback, finite, looseObject, maxLength, maxValue, minValue, nullable, number, optional, picklist, pipe, record, safeParse, string, unknown } from 'valibot'

import { maxMessageBytes, motionSources, parseMotionIntent } from './contracts'
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
    /** A camera of NeoAlice sees people (F5). `people` is above 0. */
    | { type: 'presence', site: string, people: number, camera?: string }
    /** The face recognition greets someone by name, for example "Ola Ana" (F5). */
    | { type: 'greeting', site: string, text: string }
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
const moodActions = ['evt/mood', 'cmd/evt/mood', 'cmd/avatar/gesture', 'cmd/avatar/pose', 'cmd/avatar/animation', 'cmd/avatar/emoji', 'cmd/avatar/widget', 'cmd/avatar/tool']
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
    `${topicRoot}/${site}/cmd/avatar/gesture`,
    `${topicRoot}/${site}/cmd/avatar/pose`,
    `${topicRoot}/${site}/cmd/avatar/animation`,
    `${topicRoot}/${site}/cmd/avatar/emoji`,
    `${topicRoot}/${site}/cmd/avatar/widget`,
    `${topicRoot}/${site}/cmd/avatar/tool`,
    `${topicRoot}/${companionSite}/evt/companion/state`,
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
const VisionObject = looseObject({ class: Name, class_name: Name })
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

  constructor(options: NeoAliceTranslatorOptions) {
    this.options = options
    this.catalog = options.catalog
    this.companionSite = options.companionSite ?? 'companion'
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
      case 'cmd/avatar/animation':
        return translateAnimation(topic, site, data)
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
    const key = sessionId ? `session:${sessionId}` : text.trim() ? `text:${text.trim()}` : undefined
    if (key) {
      for (const [seen, entry] of this.recentSpeech) {
        if (nowMs - entry.atMs > sameSpeechWindowMs)
          this.recentSpeech.delete(seen)
      }
      const earlier = this.recentSpeech.get(key)
      if (earlier && earlier.site !== site)
        return ignored(topic, 'the same speech came on another site')
      this.recentSpeech.set(key, { atMs: nowMs, site })
    }
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
        const name = normalizeName(command.gesture ?? command.name)
        const gesture = name && (command.mirror ? this.known(`gesture_${name}_mirror`) : undefined)
        semanticAction = gesture || (name && (this.known(`gesture_${name}`) ?? this.known(name)))
        break
      }
      case 'cmd/avatar/pose': {
        const name = normalizeName(command.pose ?? command.name)
        semanticAction = name && this.known(`pose_${name}`)
        extra = { requestedChannels: ['posture'] }
        break
      }
      default:
        emoji = command.emoji
        semanticAction = emoji ? 'emoji' : undefined
        extra = { requestedChannels: ['facial'] }
        break
    }
    if (!semanticAction)
      return ignored(topic, 'the catalog has no action for this command')

    this.sequence++
    const candidate: MotionIntent = {
      schemaVersion: 1,
      id: `neoalice-${site}-${this.sequence}`.slice(0, 128),
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
    if (action === 'evt/companion/affect') {
      const parsed = safeParse(CompanionAffectPayload, data)
      const name = parsed.success ? parsed.output.emotion ?? parsed.output.airiEmotion : undefined
      if (!name)
        return ignored(topic, 'no emotion in the companion affect')
      return { type: 'mood', site, mood: resolveMood(name), intensity: toUnit(parsed.success ? parsed.output.intensity : undefined), origin: 'companion' }
    }
    return ignored(topic, `companion topic "${action}" is not read by the bridge`)
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
  const people = objects.filter(object => (object.class ?? object.class_name) === personClass).length
  if (people === 0)
    return ignored(topic, 'no person in the vision message')
  const camera = parsed.output.detection?.camera ?? parsed.output.camera
  return { type: 'presence', site, people, ...(camera && { camera }) }
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
