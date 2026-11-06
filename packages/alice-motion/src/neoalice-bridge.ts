import type { MotionCatalog } from './catalog'
import type { MotionIntent, MotionSource } from './contracts'
import type { ResolvedMood } from './mood-vocabulary'

import { array, boolean, fallback, finite, looseObject, maxLength, maxValue, minValue, number, optional, pipe, safeParse, string } from 'valibot'

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
    | { type: 'mood', site: string, mood: ResolvedMood, intensity?: number, origin: 'neoalice' | 'companion' }
    | { type: 'intent', site: string, intent: MotionIntent, emoji?: string }
    /**
     * `cmd/avatar/animation`: an FBX or VRMA file to play on the whole body, like TalkingHead `playAnimation`.
     * `url` is the URL of the message, `name` a TalkingHead animation name. The stage resolves both.
     */
    | { type: 'animation', site: string, url?: string, name?: string, durationMs?: number }
    /** A camera of NeoAlice sees people (F5). `people` is above 0. */
    | { type: 'presence', site: string, people: number, camera?: string }
    /** The face recognition greets someone by name, for example "Ola Ana" (F5). */
    | { type: 'greeting', site: string, text: string }
    | { type: 'ignored', topic: string, reason: string }

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
const moodActions = ['evt/mood', 'cmd/evt/mood', 'cmd/avatar/gesture', 'cmd/avatar/pose', 'cmd/avatar/animation', 'cmd/avatar/emoji']

/** The topics to subscribe to. All of them are read-only for the bridge. */
export function neoAliceBridgeTopics(options: Pick<NeoAliceTranslatorOptions, 'site' | 'acceptAnySite' | 'companionSite' | 'moodSite' | 'vision' | 'facialSite'>) {
  const site = options.acceptAnySite ? '+' : options.site
  const companionSite = options.companionSite ?? 'companion'
  const moodSite = options.moodSite?.trim()
  const moodTopics = !options.acceptAnySite && moodSite && moodSite !== options.site
    ? moodActions.map(action => `${topicRoot}/${moodSite}/${action}`)
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
const CompanionStatePayload = looseObject({ mood: fallback(optional(CompanionMood), undefined) })
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
    const fromMoodSite = !!this.options.moodSite && site === this.options.moodSite && moodActions.includes(action)
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
        return this.translateSpeech(topic, site, isAudio, data)
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
      case 'cmd/avatar/gesture':
      case 'cmd/avatar/pose':
      case 'cmd/avatar/emoji':
        return this.translateAvatar(topic, site, action, data, payload)
      default:
        return ignored(topic, `topic "${action}" is not read by the bridge`)
    }
  }

  private translateSpeech(topic: string, site: string, isAudio: boolean, data: unknown): NeoAliceBridgeEvent {
    const parsed = safeParse(SpeechPayload, data)
    if (!parsed.success)
      return ignored(topic, 'speech payload is not an object')
    const text = parsed.output.tts?.text ?? parsed.output.text ?? ''
    const sessionId = parsed.output.session_id || undefined
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
      const mood = parsed.success ? parsed.output.mood : undefined
      if (!mood?.primary)
        return ignored(topic, 'no mood in the companion state')
      return { type: 'mood', site, mood: resolveMood(mood.primary), intensity: toUnit(mood.intensity), origin: 'companion' }
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
