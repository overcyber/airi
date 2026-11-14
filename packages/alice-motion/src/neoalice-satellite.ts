/**
 * Messages that the AIRI avatar publishes as a NeoAlice satellite.
 *
 * The format is the v1 format of the NeoAlice satellites (`neoalice/v1/{site}/...`).
 * NeoAlice answers an `evt/audio` with `cmd/tts/audio` on the same site, which the bridge plays.
 * These functions only build the topic and the payload. The bridge store sends them.
 */

const topicRoot = 'neoalice/v1'

/** States of `evt/state`, as the NeoAlice satellites report them. */
export type NeoAliceSatelliteState = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface NeoAliceSatelliteMessage {
  topic: string
  payload: string
  qos: 0 | 1
}

export interface NeoAliceAudioEventInput {
  site: string
  /** UUID of the NeoAlice user. Empty: NeoAlice uses its `NEOALICE_MQTT__DEFAULT_USER_ID`. */
  userId: string
  sessionId: string
  /** A complete WAV file in base64. */
  wavBase64: string
  sampleRateHz: number
  nowMs: number
}

/** Tells if a site name is a single MQTT topic level without wildcards. */
export function isPublishableSite(site: string) {
  return site.trim() !== '' && !/[/#+\s]/.test(site)
}

/**
 * One spoken phrase as `evt/audio`, the canonical v1 single message, QoS 1.
 *
 * @example
 * neoAliceAudioEvent({ site: 'airi-avatar', userId: '', sessionId: 's1', wavBase64: 'UklGR...', sampleRateHz: 16000, nowMs: 0 }).topic
 * // => 'neoalice/v1/airi-avatar/evt/audio'
 */
export function neoAliceAudioEvent(input: NeoAliceAudioEventInput): NeoAliceSatelliteMessage {
  const payload = {
    v: 1,
    type: 'evt.audio',
    ts: new Date(input.nowMs).toISOString(),
    site_id: input.site,
    ...(input.userId.trim() ? { user_id: input.userId.trim() } : {}),
    session_id: input.sessionId,
    audio: { format: 'wav', sample_rate_hz: input.sampleRateHz, channels: 1, b64: input.wavBase64 },
  }
  return { topic: `${topicRoot}/${input.site}/evt/audio`, payload: JSON.stringify(payload), qos: 1 }
}

/**
 * Typed text as `evt/stt/final`, QoS 1, as if a satellite had transcribed it. NeoAlice runs its
 * brain on it and answers with `cmd/tts/audio` on the same site.
 */
export function neoAliceSttFinalEvent(input: { site: string, userId: string, sessionId: string, text: string, lang?: string, nowMs: number }): NeoAliceSatelliteMessage {
  const payload = {
    v: 1,
    type: 'evt.stt.final',
    ts: new Date(input.nowMs).toISOString(),
    site_id: input.site,
    ...(input.userId.trim() ? { user_id: input.userId.trim() } : {}),
    session_id: input.sessionId,
    stt: { text: input.text, lang: input.lang ?? 'pt' },
  }
  return { topic: `${topicRoot}/${input.site}/evt/stt/final`, payload: JSON.stringify(payload), qos: 1 }
}

/**
 * The wake word of the avatar as `evt/wake`, QoS 1. NeoAlice answers with `cmd/tts/stop` on the site,
 * so the wake word also stops the speech of NeoAlice, like on the satellites.
 */
export function neoAliceWakeEvent(input: { site: string, userId: string, sessionId: string, word: string, confidence: number, nowMs: number }): NeoAliceSatelliteMessage {
  const payload = {
    v: 1,
    type: 'evt.wake',
    ts: new Date(input.nowMs).toISOString(),
    site_id: input.site,
    ...(input.userId.trim() ? { user_id: input.userId.trim() } : {}),
    session_id: input.sessionId,
    wake: { word: input.word, confidence: input.confidence },
  }
  return { topic: `${topicRoot}/${input.site}/evt/wake`, payload: JSON.stringify(payload), qos: 1 }
}

/**
 * The answer to a `cmd/avatar/tool` (Plan 07, W4) as `evt/avatar/tool_result`, QoS 1. `requestId` is the
 * `request_id` of the command, so NeoAlice can match the answer.
 */
export function neoAliceToolResultEvent(input: { site: string, requestId: string, tool: string, ok: boolean, result?: unknown, error?: string, nowMs: number }): NeoAliceSatelliteMessage {
  const payload = {
    v: 1,
    type: 'evt.avatar.tool_result',
    ts: new Date(input.nowMs).toISOString(),
    site_id: input.site,
    request_id: input.requestId,
    tool: input.tool,
    ok: input.ok,
    ...(input.ok ? { result: input.result ?? null } : { error: input.error ?? 'failed' }),
  }
  return { topic: `${topicRoot}/${input.site}/evt/avatar/tool_result`, payload: JSON.stringify(payload), qos: 1 }
}

/**
 * A motion that the LLM of the avatar created with `save`, as `evt/avatar/motion_save`, QoS 1. The companion service
 * keeps it in its motion library and publishes the library again, so every mirror can play it by name.
 */
export function neoAliceMotionSaveEvent(input: { site: string, motion: unknown, nowMs: number }): NeoAliceSatelliteMessage {
  const payload = { v: 1, type: 'evt.avatar.motion_save', ts: new Date(input.nowMs).toISOString(), site_id: input.site, motion: input.motion }
  return { topic: `${topicRoot}/${input.site}/evt/avatar/motion_save`, payload: JSON.stringify(payload), qos: 1 }
}

/**
 * The state of the avatar as `evt/state`, QoS 0. NeoAlice counts a site as active while it sees
 * these messages (120 s by default), so a heartbeat every 30 s keeps the avatar in the broadcasts.
 */
export function neoAliceStateEvent(input: { site: string, state: NeoAliceSatelliteState, detail: string, sessionId?: string, nowMs: number }): NeoAliceSatelliteMessage {
  const payload = {
    v: 1,
    type: 'evt.state',
    ts: new Date(input.nowMs).toISOString(),
    site_id: input.site,
    session_id: input.sessionId ?? null,
    state: { value: input.state, detail: input.detail },
  }
  return { topic: `${topicRoot}/${input.site}/evt/state`, payload: JSON.stringify(payload), qos: 0 }
}
