import type { NeoAliceBridgeEvent, SpeechSegment } from '@proj-airi/alice-motion'

import type { StageEmote } from '../libs/alice-motion/stage-motion'

import { errorMessageFrom } from '@moeru/std'
import { isPublishableSite, neoAliceAudioEvent, neoAliceStateEvent } from '@proj-airi/alice-motion'
import { onScopeDispose, ref, watch } from 'vue'

import { NeoAliceMicrophone, neoAliceVoiceSampleRate, segmentToWavBase64 } from '../libs/alice-motion/neoalice-voice'
import { StageMotionRuntime } from '../libs/alice-motion/stage-motion'
import { useNeoAliceBridgeStore } from '../stores/modules/neoalice-bridge'

export interface NeoAliceStageBridgeOptions {
  /** Plays a clip of the VRM stage. Resolves `false` when the stage is not VRM or has no such clip. */
  playClip: (clipId: string) => Promise<boolean>
  /** Emotes of the VRM motion library, including imported VRMA files. */
  emotes: () => readonly StageEmote[]
  /** Synthesizes text with the AIRI voice settings. Resolves `null` when no voice is configured. */
  synthesize: (text: string, signal: AbortSignal) => Promise<Blob | null>
  /** Plays speech audio on the stage output, with lip sync. Resolves when it ends or stops. */
  playSpeech: (audio: Blob, text: string) => Promise<void>
  stopSpeech: () => void
  /** Shows text that is not spoken, for example in the silent speech mode. */
  showCaption: (text: string) => void
  /** Applies an AIRI emotion name, for example `happy`, with an intensity from 0 to 1. */
  applyEmotion: (emotion: string, intensity: number) => void
}

/** The bridge stops thinking after this time without speech, so a lost reply cannot freeze the pose. */
const thinkingTimeoutMs = 20_000
/** The motion runtime ticks on this interval. It only starts cues. Frames play the clips on their own clock. */
const tickIntervalMs = 100
/** The microphone stays deaf for this time after the avatar speaks, so the room echo is not sent. */
const echoTailMs = 700
/**
 * Wait for the reply to one phrase. NeoAlice measured up to about 115 s (Whisper on the CPU, the LLM,
 * and one TTS at a time). No new phrase goes out while one waits, so NeoAlice does not fill its queue.
 */
const voiceReplyTimeoutMs = 150_000
/** Interval of the `evt/state` heartbeat. NeoAlice forgets a satellite after 120 s without one. */
const heartbeatIntervalMs = 30_000

/**
 * Mounted stages that use the bridge, in mount order. Only the first one plays bridge events,
 * so a second stage, for example a settings preview, never speaks the same line again.
 */
const mountedStages: symbol[] = []

/**
 * Connects the NeoAlice bridge (S08) to the stage.
 *
 * It holds the read-only MQTT connection while the stage is mounted, and turns bridge events into
 * speech, captions, moods, and motion cues. Motion goes through the director (S03) and the scheduler (S04).
 */
export function useNeoAliceStageBridge(options: NeoAliceStageBridgeOptions) {
  const bridge = useNeoAliceBridgeStore()
  const runtime = new StageMotionRuntime({
    playClip: options.playClip,
    log: message => console.info(`[neoalice-bridge] ${message}`),
  })
  /** `true` from the final user transcript until the speech starts. The VRM shows the thinking pose. */
  const thinking = ref(false)
  let thinkingSinceMs = 0
  let speechSequence = 0
  let currentSession: string | undefined
  const sessionsOfConnection = new Set<string>()
  let synthesis: AbortController | undefined

  const clock = () => performance.now()

  let voiceSequence = 0
  let deafUntilMs = 0
  /** The phrase that waits for its reply, and since when. */
  let waitingSince: number | undefined
  const microphone = new NeoAliceMicrophone(segment => void sendPhrase(segment))

  watch(options.emotes, emotes => runtime.setEmotes(emotes), { immediate: true })

  async function speak(sessionId: string, text: string, audio: () => Promise<Blob | null>) {
    const now = clock()
    stopWaiting()
    if (text)
      bridge.lastHeard = text
    announce('speaking', sessionId)
    currentSession = sessionId
    sessionsOfConnection.add(sessionId)
    thinking.value = false
    runtime.speechStarted(sessionId, now)
    try {
      const blob = await audio()
      if (blob && currentSession === sessionId)
        await options.playSpeech(blob, text)
      else if (text)
        options.showCaption(text)
    }
    catch (error) {
      console.warn('[neoalice-bridge] speech failed:', errorMessageFrom(error) ?? 'unknown error')
      if (text)
        options.showCaption(text)
    }
    finally {
      runtime.speechEnded(sessionId, clock())
      if (currentSession === sessionId) {
        currentSession = undefined
        announce(microphone.running ? 'listening' : 'idle')
      }
    }
  }

  function stopCurrentSpeech() {
    synthesis?.abort()
    synthesis = undefined
    options.stopSpeech()
    if (currentSession) {
      runtime.director.interrupt(clock())
      runtime.cancelSession(currentSession, clock())
      currentSession = undefined
    }
  }

  function handle(event: NeoAliceBridgeEvent) {
    const now = clock()
    switch (event.type) {
      case 'speech-text': {
        stopWaiting()
        speechSequence++
        const sessionId = event.sessionId ?? `neoalice-${speechSequence}`
        if (bridge.speechMode !== 'airi-voice') {
          options.showCaption(event.text)
          return
        }
        synthesis?.abort()
        const controller = new AbortController()
        synthesis = controller
        void speak(sessionId, event.text, () => options.synthesize(event.text, controller.signal))
        return
      }
      case 'speech-audio': {
        stopWaiting()
        speechSequence++
        const sessionId = event.sessionId ?? `neoalice-${speechSequence}`
        if (bridge.speechMode === 'silent') {
          if (event.text)
            options.showCaption(event.text)
          return
        }
        void speak(sessionId, event.text, async () => base64ToWav(event.audioBase64))
        return
      }
      case 'speech-stop':
        stopCurrentSpeech()
        return
      case 'user-speech':
        runtime.director.userStartedSpeaking(now)
        runtime.director.userFinishedSpeaking(now)
        thinking.value = true
        thinkingSinceMs = now
        return
      case 'mood':
        runtime.director.setAffect(event.mood.airiEmotion, event.intensity)
        options.applyEmotion(event.mood.airiEmotion, event.intensity ?? 1)
        return
      case 'intent':
      {
        const result = runtime.submit({ ...event.intent, timestampMs: Math.round(now) }, now)
        if (!result.ok)
          console.info(`[neoalice-bridge] refused ${event.intent.semanticAction}: ${result.reason}`)
        break
      }
      default:
        break
    }
  }

  const token = Symbol('neoalice-stage')
  mountedStages.push(token)
  // Microphone of the avatar: each phrase goes to NeoAlice as `evt/audio` on the site of the avatar,
  // like a satellite. NeoAlice answers with `cmd/tts/audio` on the same site. Only the first mounted
  // stage listens, like the playback of bridge events.

  async function sendPhrase(segment: SpeechSegment) {
    if (waitingSince !== undefined)
      return
    const site = bridge.site.trim()
    if (bridge.acceptAnySite || !isPublishableSite(site)) {
      bridge.voiceStatus = 'error'
      bridge.voiceError = 'Set one site for the avatar, for example airi-avatar. The microphone does not publish with "Follow every site".'
      return
    }
    const sessionId = `airi-voice-${Date.now()}-${++voiceSequence}`
    try {
      const sent = await bridge.publish(neoAliceAudioEvent({
        site,
        userId: bridge.userId,
        sessionId,
        wavBase64: segmentToWavBase64(segment),
        sampleRateHz: neoAliceVoiceSampleRate,
        nowMs: Date.now(),
      }))
      if (!sent) {
        bridge.voiceStatus = 'error'
        bridge.voiceError = 'The bridge is not connected to the broker.'
        return
      }
      waitingSince = clock()
      bridge.voiceStatus = 'waiting'
      bridge.voiceError = ''
      runtime.director.userStartedSpeaking(clock())
      runtime.director.userFinishedSpeaking(clock())
      thinking.value = true
      thinkingSinceMs = clock()
      announce('thinking', sessionId)
    }
    catch (error) {
      bridge.voiceStatus = 'error'
      bridge.voiceError = errorMessageFrom(error) ?? 'The phrase was not published'
    }
  }

  /** Ends the wait for a reply: the reply arrived, or it took too long. */
  function stopWaiting() {
    if (waitingSince === undefined)
      return
    waitingSince = undefined
    if (microphone.running)
      bridge.voiceStatus = 'listening'
  }

  function announce(state: 'idle' | 'listening' | 'thinking' | 'speaking', sessionId?: string) {
    const site = bridge.site.trim()
    if (!bridge.announceState || bridge.acceptAnySite || !isPublishableSite(site) || mountedStages[0] !== token)
      return
    const detail = state === 'idle' ? 'hb' : state
    void bridge.publish(neoAliceStateEvent({ site, state, detail, sessionId, nowMs: Date.now() }))
      .catch(error => console.warn('[neoalice-bridge] evt/state failed:', errorMessageFrom(error) ?? 'unknown error'))
  }

  async function updateMicrophone() {
    const wanted = bridge.voiceInput && mountedStages[0] === token
    if (wanted === microphone.running)
      return
    if (!wanted) {
      stopWaiting()
      await microphone.stop()
      bridge.voiceStatus = 'off'
      return
    }
    bridge.voiceStatus = 'starting'
    bridge.voiceError = ''
    try {
      await microphone.start()
      bridge.voiceStatus = 'listening'
    }
    catch (error) {
      bridge.voiceStatus = 'error'
      bridge.voiceError = errorMessageFrom(error) ?? 'The microphone did not start'
    }
  }

  const stopEvents = bridge.onEvent((event) => {
    if (mountedStages[0] === token)
      handle(event)
  })
  // A reconnection can replay retained or queued messages. The sessions of the old connection never play again.
  const stopReconnect = bridge.onReconnect(() => {
    const now = clock()
    for (const sessionId of sessionsOfConnection)
      runtime.cancelSession(sessionId, now)
    sessionsOfConnection.clear()
  })
  const release = bridge.hold()
  let lastHeartbeatMs = Number.NEGATIVE_INFINITY
  const stopVoiceWatch = watch(() => bridge.voiceInput, () => void updateMicrophone(), { immediate: true })
  const timer = setInterval(() => {
    const now = clock()
    // The avatar must not hear its own voice: no capture while it speaks, and for a short tail after.
    if (currentSession !== undefined)
      deafUntilMs = now + echoTailMs
    microphone.paused = now < deafUntilMs
    if (waitingSince !== undefined && now - waitingSince > voiceReplyTimeoutMs) {
      stopWaiting()
      thinking.value = false
    }
    if (thinking.value && waitingSince === undefined && now - thinkingSinceMs > thinkingTimeoutMs)
      thinking.value = false
    if (now - lastHeartbeatMs >= heartbeatIntervalMs) {
      lastHeartbeatMs = now
      announce(currentSession ? 'speaking' : waitingSince !== undefined ? 'thinking' : microphone.running ? 'listening' : 'idle')
    }
    void runtime.tick(now)
  }, tickIntervalMs)

  onScopeDispose(() => {
    mountedStages.splice(mountedStages.indexOf(token), 1)
    clearInterval(timer)
    stopEvents.off()
    stopReconnect.off()
    synthesis?.abort()
    stopVoiceWatch()
    waitingSince = undefined
    void microphone.stop().then(() => {
      bridge.voiceStatus = 'off'
    })
    release()
  })

  return { thinking, runtime }
}

/** Decodes base64 WAV from `cmd/tts/audio`. Returns `null` for broken base64. */
export function base64ToWav(base64: string): Blob | null {
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++)
      bytes[index] = binary.charCodeAt(index)
    return new Blob([bytes], { type: 'audio/wav' })
  }
  catch {
    return null
  }
}
