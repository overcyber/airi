import type { NeoAliceBridgeEvent, SpeechSegment } from '@proj-airi/alice-motion'

import type { StageEmote } from '../libs/alice-motion/stage-motion'

import { errorMessageFrom } from '@moeru/std'
import { isPublishableSite, matchWakeWord, neoAliceAudioEvent, neoAliceStateEvent, neoAliceSttFinalEvent, neoAliceToolResultEvent, neoAliceWakeEvent, parseWakeWords } from '@proj-airi/alice-motion'
import { number, object, safeParse, string } from 'valibot'
import { onScopeDispose, ref, watch } from 'vue'

import { builtinGestureOfEmoji, SpeechGesturePicker } from '../libs/alice-motion/builtin-gestures'
import { resolveNeoAliceAnimationUrls } from '../libs/alice-motion/neoalice-animation-url'
import { runNeoAliceTool, widgetToolInput } from '../libs/alice-motion/neoalice-tools'
import { NeoAliceMicrophone, neoAliceVoiceSampleRate, segmentToWavBase64 } from '../libs/alice-motion/neoalice-voice'
import { StageMotionRuntime } from '../libs/alice-motion/stage-motion'
import { useLlmToolsStore } from '../stores/ai/chat-llm/tools'
import { useChatSessionStore } from '../stores/chat/session-store'
import { useNeoAliceBrainStore } from '../stores/modules/neoalice-brain'
import { useNeoAliceBridgeStore } from '../stores/modules/neoalice-bridge'
import { aliceServerOrigin, useVrmMotionsStore } from '../stores/vrm-motions'
import { useNeoAliceBrainTools } from './use-neoalice-brain-tools'
import { useNeoAlicePhraseTranscriber } from './use-neoalice-phrase-transcriber'

export interface NeoAliceStageBridgeOptions {
  /** Plays a clip of the VRM stage. Resolves `false` when the stage is not VRM or has no such clip. */
  playClip: (clipId: string, options: { durationMs?: number }) => Promise<boolean>
  /** Plays an FBX or VRMA file by URL on the whole body, for `durationMs`. Resolves `false` when it cannot. */
  playAnimation?: (url: string, durationMs?: number) => Promise<boolean>
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
  /** Shows a short face reaction that does not change the resting mood, for example for an emoji. */
  reactEmotion?: (emotion: string) => void
  /** Shows the bond of the companion state on the face (warmth and energy, 0 to 1). */
  applyBond?: (bond: { warmth: number, energy: number }) => void
  /** Shows the own face of an emoji, as TalkingHead does. Returns `false` when the stage cannot. */
  reactEmoji?: (emoji: string) => boolean
}

/** The bridge stops thinking after this time without speech, so a lost reply cannot freeze the pose. */
const thinkingTimeoutMs = 20_000
/** A person position of the NeoAlice vision is stale after this time without a new message. */
const visionPersonTimeoutMs = 5000
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
/** A camera that sees nobody for this long, then a person, counts as an arrival. */
const presenceGapMs = 60_000
/** Shortest time between two greetings. */
const greetingGapMs = 10_000
/** A bare wake word opens the microphone for one phrase during this time. */
const wakeListenMs = 8000

/**
 * Mounted stages that use the bridge, in mount order. Only the first one plays bridge events,
 * so a second stage, for example a settings preview, never speaks the same line again.
 */
const mountedStages: symbol[] = []

/** A speech that one tab claimed stays claimed this long, so a late copy in another tab does not play. */
const speechClaimMs = 30_000

/**
 * Claims a speech for this tab. Several tabs of AIRI in one browser, for example `/` and `/mirror`, each run the
 * bridge, so each one would play the same speech. The first tab that asks gets the Web Lock and holds it for a while.
 * Without Web Locks (an old browser), every tab plays.
 */
async function claimSpeechInBrowser(speech: string): Promise<boolean> {
  const locks = globalThis.navigator?.locks
  if (!locks)
    return true
  const name = `airi-neoalice-speech:${speech.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200)}`
  return await new Promise<boolean>((resolve) => {
    void locks.request(name, { ifAvailable: true }, async (lock) => {
      resolve(lock !== null)
      if (lock)
        await new Promise(done => setTimeout(done, speechClaimMs))
    }).catch(() => resolve(true))
  })
}

interface StoredMood {
  emotion: string
  intensity: number
  atMs: number
}

/** NeoAlice keeps a mood for hours. After half a day, the stored mood is too old to show. */
const storedMoodMaxAgeMs = 12 * 60 * 60 * 1000

const storedMoodSchema = object({ emotion: string(), intensity: number(), atMs: number() })

/** Reads the stored mood. An empty or broken value gives `undefined`. */
export function readStoredMood(raw: string): StoredMood | undefined {
  if (!raw)
    return undefined
  try {
    const result = safeParse(storedMoodSchema, JSON.parse(raw))
    return result.success ? result.output : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Connects the NeoAlice bridge (S08) to the stage.
 *
 * It holds the read-only MQTT connection while the stage is mounted, and turns bridge events into
 * speech, captions, moods, and motion cues. Motion goes through the director (S03) and the scheduler (S04).
 */
export function useNeoAliceStageBridge(options: NeoAliceStageBridgeOptions) {
  const bridge = useNeoAliceBridgeStore()
  const brain = useNeoAliceBrainStore()
  const chatSession = useChatSessionStore()
  const brainTools = useNeoAliceBrainTools()
  const vrmMotions = useVrmMotionsStore()
  const llmTools = useLlmToolsStore()
  const runtime = new StageMotionRuntime({
    playClip: options.playClip,
    log: message => console.info(`[neoalice-bridge] ${message}`),
  })
  /** `true` from the final user transcript until the speech starts. The VRM shows the thinking pose. */
  const thinking = ref(false)
  /**
   * The night mode of Alice (`evt/alice/night_mode`). The VRM lies down and closes the eyes. The body motions of
   * NeoAlice and of the speech wait until it ends. A pose command ends it, for example `straight`.
   */
  const nightMode = ref(false)
  /** The person that a NeoAlice camera sees, 0 to 1 in its image, for the `person` tracking mode. */
  const visionPerson = ref<{ x: number, y: number } | null>(null)
  let visionPersonAtMs = 0
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
  let lastPresenceMs = Number.NEGATIVE_INFINITY
  let lastGreetingMs = Number.NEGATIVE_INFINITY
  let greetingSequence = 0
  /** After a bare wake word, the next phrase goes to NeoAlice without the wake word, until this time. */
  let wakeOpenUntilMs = 0
  const phrases = useNeoAlicePhraseTranscriber()
  const microphone = new NeoAliceMicrophone(segment => void sendPhrase(segment))
  /** The built-in motion of each speech. It spaces the motions out, so the same one does not play on each reply. */
  const speechGestures = new SpeechGesturePicker()

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
    if (text && !nightMode.value)
      playBuiltinGesture(speechGestures.pick(text, now), 'speech', now)
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

  /** Tries each URL of an animation until one plays. The logs name each URL that failed. */
  async function playFirstAnimation(urls: readonly string[], durationMs: number | undefined) {
    for (const url of urls) {
      if (await options.playAnimation?.(url, durationMs)) {
        console.info(`[neoalice-bridge] played the animation ${url}`)
        return
      }
      console.warn(`[neoalice-bridge] could not play the animation ${url}`)
    }
  }

  let builtinSequence = 0
  /** Plays a built-in motion of the stage, when the motion library has it. */
  function playBuiltinGesture(action: string | undefined, reason: string, now: number) {
    if (!action || !runtime.actions.has(action))
      return
    const result = runtime.submit({ schemaVersion: 1, id: `neoalice-builtin-${++builtinSequence}`, timestampMs: Math.round(now), source: 'llm', semanticAction: action }, now)
    if (!result.ok)
      console.info(`[neoalice-bridge] refused the ${reason} motion ${action}: ${result.reason}`)
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
        recordReply(event.text)
        speechSequence++
        const sessionId = event.sessionId ?? `neoalice-${speechSequence}`
        if (speechMode() !== 'airi-voice') {
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
        recordReply(event.text)
        speechSequence++
        const sessionId = event.sessionId ?? `neoalice-${speechSequence}`
        if (speechMode() === 'silent') {
          if (event.text)
            options.showCaption(event.text)
          return
        }
        void claimSpeechInBrowser(event.text || sessionId).then((claimed) => {
          if (claimed)
            void speak(sessionId, event.text, async () => base64ToWav(event.audioBase64))
          else
            console.info('[neoalice-bridge] another tab of this browser plays this speech')
        })
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
      case 'bond':
        options.applyBond?.(event.bond)
        return
      case 'mood':
        if (event.bond)
          options.applyBond?.(event.bond)
        runtime.director.setAffect(event.mood.airiEmotion, event.intensity)
        options.applyEmotion(event.mood.airiEmotion, event.intensity ?? 1)
        bridge.lastMood = JSON.stringify({ emotion: event.mood.airiEmotion, intensity: event.intensity ?? 1, atMs: Date.now() } satisfies StoredMood)
        return
      case 'night-mode':
        if (nightMode.value !== event.active)
          console.info(`[neoalice-bridge] night mode ${event.active ? 'on' : 'off'}`)
        nightMode.value = event.active
        return
      case 'intent':
      {
        if (nightMode.value) {
          // In the night mode she lies with the eyes closed. A pose wakes her up and plays, other motions wait.
          if (!event.intent.semanticAction.startsWith('pose_')) {
            console.info(`[neoalice-bridge] night mode: ignored ${event.intent.semanticAction}`)
            break
          }
          nightMode.value = false
          console.info(`[neoalice-bridge] night mode off by ${event.intent.semanticAction}`)
        }
        // NeoAlice sends an emoji to show on the face. The VRM has no emoji, so the face reacts with its emotion.
        const reaction = event.emoji && !options.reactEmoji?.(event.emoji) ? emotionOfEmoji(event.emoji) : undefined
        if (reaction)
          options.reactEmotion?.(reaction)
        // An emoji with a built-in motion, for example a wave or a bow, plays that motion.
        const builtin = event.emoji ? builtinGestureOfEmoji(event.emoji) : undefined
        if (builtin && runtime.actions.has(builtin)) {
          playBuiltinGesture(builtin, 'emoji', now)
          break
        }
        const result = runtime.submit({ ...event.intent, timestampMs: Math.round(now) }, now)
        if (!result.ok)
          console.info(`[neoalice-bridge] refused ${event.intent.semanticAction}: ${result.reason}`)
        break
      }
      case 'animation': {
        const urls = resolveNeoAliceAnimationUrls(event, aliceServerOrigin(), vrmMotions.motionLibrary.emotes)
        if (urls.length === 0 || !options.playAnimation) {
          console.info(`[neoalice-bridge] no animation to play for ${event.url ?? event.name}`)
          break
        }
        void playFirstAnimation(urls, event.durationMs)
        break
      }
      case 'widget':
        void runNeoAliceTool(name => llmTools.getToolsByNames(name)[0], 'stage_widgets', widgetToolInput(event), `widget-${Date.now()}`)
          .then(result => console.info(`[neoalice-bridge] widget ${event.action}${event.widget ? ` ${event.widget}` : ''}: ${result.ok ? 'done' : result.error}`))
        break
      case 'tool':
        void runNeoAliceTool(name => llmTools.getToolsByNames(name)[0], event.tool, event.args, event.requestId).then((result) => {
          console.info(`[neoalice-bridge] tool ${event.tool}: ${result.ok ? 'done' : result.error}`)
          const site = bridge.site.trim()
          if (!isPublishableSite(site))
            return
          void bridge.publish(neoAliceToolResultEvent({ site, requestId: event.requestId, tool: event.tool, nowMs: Date.now(), ...result }))
            .catch(error => console.warn('[neoalice-bridge] evt/avatar/tool_result failed:', errorMessageFrom(error) ?? 'unknown error'))
        })
        break
      case 'presence':
        if (event.target) {
          visionPerson.value = event.target
          visionPersonAtMs = now
        }
        // A person who arrives after a quiet time gets a wave and a smile. A person who stays does not.
        if (now - lastPresenceMs > presenceGapMs && !nightMode.value)
          greet(now)
        lastPresenceMs = now
        break
      case 'greeting':
        if (!nightMode.value)
          greet(now)
        break
      default:
        break
    }
  }

  /** Smile and wave, at most once per {@link greetingGapMs}, for example for a camera and a face greeting together. */
  function greet(now: number) {
    if (now - lastGreetingMs < greetingGapMs)
      return
    lastGreetingMs = now
    options.reactEmotion?.('happy')
    const result = runtime.submit({ schemaVersion: 1, id: `neoalice-vision-${++greetingSequence}`, timestampMs: Math.round(now), source: 'vision', semanticAction: runtime.actions.has('wave_hello') ? 'wave_hello' : 'wave_right' }, now)
    if (!result.ok)
      console.info(`[neoalice-bridge] refused the greeting wave: ${result.reason}`)
  }

  const token = Symbol('neoalice-stage')
  mountedStages.push(token)
  // Microphone of the avatar: each phrase goes to NeoAlice as `evt/audio` on the site of the avatar,
  // like a satellite. NeoAlice answers with `cmd/tts/audio` on the same site. Only the first mounted
  // stage listens, like the playback of bridge events.

  async function sendPhrase(segment: SpeechSegment) {
    const wakeWords = parseWakeWords(bridge.wakeWord)
    if (wakeWords.length > 0)
      return sendWakePhrase(segment, wakeWords)
    if (waitingSince !== undefined)
      return
    const site = bridge.site.trim()
    if (followsAnySite() || !isPublishableSite(site)) {
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

  /**
   * Wake word mode (Plan 06, F2). The phrase is transcribed here, and only a call to Alice goes to NeoAlice:
   * - "Eva, que horas sao": the wake word stops her speech (barge-in), `evt/wake` goes out, and the question
   *   goes as `evt/stt/final`. NeoAlice answers `evt/wake` with `cmd/tts/stop`, like on the satellites.
   * - "Eva" alone: the microphone takes the next phrase, within {@link wakeListenMs}, without the wake word.
   * - Any other phrase is dropped. The microphone also listens while she speaks, so a wake word can stop her.
   */
  async function sendWakePhrase(segment: SpeechSegment, wakeWords: string[]) {
    const site = bridge.site.trim()
    if (followsAnySite() || !isPublishableSite(site)) {
      bridge.voiceStatus = 'error'
      bridge.voiceError = 'Set one site for the avatar, for example airi-avatar. The microphone does not publish with "Follow every site".'
      return
    }
    let text: string
    try {
      bridge.voiceStatus = 'transcribing'
      text = (await phrases.transcribe(segment)).trim()
    }
    catch (error) {
      bridge.voiceStatus = 'error'
      bridge.voiceError = errorMessageFrom(error) ?? 'The phrase was not transcribed'
      return
    }
    bridge.voiceStatus = waitingSince === undefined ? 'listening' : 'waiting'
    const match = text ? matchWakeWord(text, wakeWords) : undefined
    const open = clock() < wakeOpenUntilMs
    if (!match && (!open || !text))
      return
    try {
      if (match) {
        stopCurrentSpeech()
        stopWaiting()
        const sessionId = `airi-wake-${Date.now()}-${++voiceSequence}`
        await bridge.publish(neoAliceWakeEvent({ site, userId: bridge.userId, sessionId, word: match.word, confidence: 1, nowMs: Date.now() }))
        options.reactEmotion?.('surprised')
        if (!match.rest) {
          wakeOpenUntilMs = clock() + wakeListenMs
          announce('listening', sessionId)
          return
        }
      }
      wakeOpenUntilMs = 0
      await sendTypedText(match ? match.rest : text)
      bridge.voiceStatus = 'waiting'
      bridge.voiceError = ''
      runtime.director.userStartedSpeaking(clock())
      runtime.director.userFinishedSpeaking(clock())
    }
    catch (error) {
      bridge.voiceStatus = 'error'
      bridge.voiceError = errorMessageFrom(error) ?? 'The phrase was not published'
    }
  }

  /**
   * The speech mode in effect. In the brain mode, AIRI is the face of NeoAlice, so it always speaks:
   * the silent mode plays the audio of NeoAlice there.
   */
  function speechMode() {
    return brain.brainMode && bridge.speechMode === 'silent' ? 'neoalice-audio' : bridge.speechMode
  }

  /** Publishing needs one site. The brain mode ignores "Follow every site". */
  function followsAnySite() {
    return bridge.acceptAnySite && !brain.brainMode
  }

  /** Sends typed text of the chat to NeoAlice (brain mode). It throws when it cannot send. */
  async function sendTypedText(text: string) {
    const site = bridge.site.trim()
    if (!isPublishableSite(site))
      throw new Error('Set the Site of the avatar in the NeoAlice bridge settings, for example airi-avatar. Use a site of its own, not the site of the mirror.')
    const sessionId = `airi-chat-${Date.now()}-${++voiceSequence}`
    const sent = await bridge.publish(neoAliceSttFinalEvent({ site, userId: bridge.userId, sessionId, text, nowMs: Date.now() }))
    if (!sent)
      throw new Error('The NeoAlice bridge is not connected to the broker.')
    waitingSince = clock()
    thinking.value = true
    thinkingSinceMs = clock()
    announce('thinking', sessionId)
  }

  /** In the brain mode, the reply of NeoAlice is the reply of the chat, so the history keeps it. */
  function recordReply(text: string) {
    if (brain.brainMode && text)
      brainTools.noteReply(text)
    const sessionId = chatSession.activeSessionId
    if (!brain.brainMode || !text || !sessionId)
      return
    void chatSession.storeMessage(sessionId, {
      role: 'assistant',
      content: text,
      slices: [{ type: 'text', text }],
      tool_results: [],
      id: `neoalice-${Date.now()}-${++voiceSequence}`,
      createdAt: Date.now(),
    }).catch(error => console.warn('[neoalice-bridge] the reply was not stored:', errorMessageFrom(error) ?? 'unknown error'))
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
    if (!bridge.announceState || followsAnySite() || !isPublishableSite(site) || mountedStages[0] !== token)
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
  // Only the first mounted stage sends typed text, like the playback of bridge events.
  const disconnectTextSink = brain.connectTextSink(async (text) => {
    if (mountedStages[0] !== token)
      throw new Error('Another stage plays NeoAlice.')
    await sendTypedText(text)
  })
  let lastHeartbeatMs = Number.NEGATIVE_INFINITY
  const stopVoiceWatch = watch(() => bridge.voiceInput, () => void updateMicrophone(), { immediate: true })
  const timer = setInterval(() => {
    const now = clock()
    // The avatar must not hear its own voice: no capture while it speaks, and for a short tail after.
    if (currentSession !== undefined)
      deafUntilMs = now + echoTailMs
    // With a wake word, the microphone also listens while she speaks, so the wake word can stop her.
    // Her own voice rarely starts with the wake word, and the browser echo cancellation removes most of it.
    microphone.paused = now < deafUntilMs && parseWakeWords(bridge.wakeWord).length === 0
    if (waitingSince !== undefined && now - waitingSince > voiceReplyTimeoutMs) {
      stopWaiting()
      thinking.value = false
    }
    if (thinking.value && waitingSince === undefined && now - thinkingSinceMs > thinkingTimeoutMs)
      thinking.value = false
    if (visionPerson.value && now - visionPersonAtMs > visionPersonTimeoutMs)
      visionPerson.value = null
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
    disconnectTextSink()
    brainTools.dispose()
    waitingSince = undefined
    void microphone.stop().then(() => {
      bridge.voiceStatus = 'off'
    })
    release()
  })

  /**
   * Shows the last mood of NeoAlice again, for example on a model that just loaded.
   * A mood older than {@link storedMoodMaxAgeMs} is stale, and the face stays neutral.
   */
  function restoreMood(nowMs = Date.now()) {
    if (!bridge.enabled || mountedStages[0] !== token)
      return
    const mood = readStoredMood(bridge.lastMood)
    if (!mood || nowMs - mood.atMs > storedMoodMaxAgeMs || mood.emotion === 'neutral')
      return
    runtime.director.setAffect(mood.emotion, mood.intensity)
    options.applyEmotion(mood.emotion, mood.intensity)
  }

  return { thinking, nightMode, visionPerson, runtime, restoreMood }
}

/** Face emotion of an emoji of `cmd/avatar/emoji`. Unknown emoji give `undefined`. */
export function emotionOfEmoji(emoji: string): string | undefined {
  if (/[\u{1F600}-\u{1F60E}\u{1F617}-\u{1F61D}\u{1F642}\u{1F643}\u{1F917}\u{1F929}\u{1F970}\u{1F973}\u{263A}\u{2764}\u{1F496}\u{1F44B}\u{1F44D}\u{1F389}]/u.test(emoji))
    return 'happy'
  if (/[\u{1F622}\u{1F62D}\u{1F61E}\u{1F614}\u{1F625}\u{1F641}\u{1F97A}\u{2639}\u{1F494}]/u.test(emoji))
    return 'sad'
  if (/[\u{1F620}\u{1F621}\u{1F624}\u{1F92C}\u{1F612}]/u.test(emoji))
    return 'angry'
  if (/[\u{1F62E}\u{1F62F}\u{1F632}\u{1F631}\u{1F92F}\u{1F628}\u{1F630}\u{1F633}]/u.test(emoji))
    return 'surprised'
  if (/[\u{1F914}\u{1F9D0}\u{1F928}]/u.test(emoji))
    return 'think'
  if (/[\u{1F634}\u{1F62A}\u{1F971}\u{1F60C}]/u.test(emoji))
    return 'relaxed'
  return undefined
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
