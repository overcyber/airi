import type { NeoAliceBridgeEvent, NeoAliceSatelliteMessage } from '@proj-airi/alice-motion'
import type { MqttClient } from 'mqtt'

import { errorMessageFrom } from '@moeru/std'
import { isPublishableSite, neoAliceBridgeTopics, NeoAliceTranslator } from '@proj-airi/alice-motion'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { createEventHook, watchDebounced } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { catalogWithEmotes } from '../../libs/alice-motion/stage-motion'
import { useVrmMotionsStore } from '../vrm-motions'
import { useNeoAliceBrainStore } from './neoalice-brain'

/** The one load of MQTT.js for the whole app. */
let mqttConnectLoading: Promise<typeof import('mqtt')['connect']> | undefined

/**
 * Loads the `connect` function of MQTT.js only when the bridge starts, so a disabled bridge costs nothing.
 *
 * NOTICE:
 * The browser build of MQTT.js 5 (`dist/mqtt.esm.js`) has only a default export, so `import('mqtt').connect`
 * is undefined in the browser. Node resolves `build/index.js`, which has the named export.
 * Source: `node_modules/mqtt/package.json` (`exports['.'].browser.import`) and the end of `dist/mqtt.esm.js`.
 * Removal condition: MQTT.js adds named exports to its browser ESM build.
 */
function loadMqttConnect(): Promise<typeof import('mqtt')['connect']> {
  // One load for the whole app. A settings change during the first load reuses it.
  mqttConnectLoading ??= import('mqtt').then((module) => {
    const loaded = module as typeof import('mqtt') & { default?: typeof import('mqtt') }
    const connect = loaded.connect ?? loaded.default?.connect
    if (typeof connect !== 'function')
      throw new Error('MQTT.js has no connect function')
    return connect
  })
  // A failed load can be tried again on the next start.
  mqttConnectLoading.catch(() => {
    mqttConnectLoading = undefined
  })
  return mqttConnectLoading
}

/**
 * How the bridge plays NeoAlice speech.
 * - `airi-voice`: `cmd/tts/say` text is spoken with the voice of the AIRI speech settings. `cmd/tts/audio` plays as sent.
 * - `neoalice-audio`: only `cmd/tts/audio` plays. Text is shown, not spoken.
 * - `silent`: nothing plays. The avatar still moves and changes mood. Use it next to the mirror, in shadow mode.
 */
export type NeoAliceSpeechMode = 'airi-voice' | 'neoalice-audio' | 'silent'

export type NeoAliceBridgeStatus = 'off' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export type NeoAliceVoiceStatus = 'off' | 'starting' | 'listening' | 'waiting' | 'error'

/**
 * Default broker URL: the `/mqtt` path of the page address.
 *
 * The Alice deployment (`airi-web` in `deploy/alice`) and the Vite dev server forward `/mqtt` to the
 * WebSocket listener of the broker. So the bridge works on any address of the machine, and an HTTPS
 * page uses `wss`, which the browser requires. Outside a web page, for example in Electron, the
 * default is a broker on this machine.
 */
export function defaultNeoAliceBrokerUrl(page: Pick<Location, 'protocol' | 'host'> | undefined = globalThis.location) {
  if (!page || !/^https?:$/.test(page.protocol) || !page.host)
    return 'ws://localhost:9001'
  return `${page.protocol === 'https:' ? 'wss' : 'ws'}://${page.host}/mqtt`
}

/**
 * NeoAlice bridge, sprint S08.
 *
 * A read-only MQTT client over WebSocket. It subscribes to the topics of one NeoAlice site and of the
 * companion service, translates each message with `NeoAliceTranslator`, and hands the events to the stage.
 * It publishes only on its own site, like a NeoAlice satellite: `evt/audio` with the microphone phrases
 * (`voiceInput`), `evt/stt/final` with typed text (brain mode), and the `evt/state` heartbeat
 * (`announceState`). All are off by default. NeoAlice answers on the same site with `cmd/tts/audio`.
 *
 * The connection lives while at least one holder needs it: the stage and the settings page call `hold`.
 */
export const useNeoAliceBridgeStore = defineStore('neoalice-bridge', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/neoalice-bridge/enabled', false)
  /** WebSocket URL of the broker, for example `ws://192.0.2.10:9001`. Mosquitto needs a `websockets` listener. */
  const brokerUrl = useLocalStorageManualReset<string>('settings/neoalice-bridge/broker-url', defaultNeoAliceBrokerUrl())
  const site = useLocalStorageManualReset<string>('settings/neoalice-bridge/site', '')
  const acceptAnySite = useLocalStorageManualReset<boolean>('settings/neoalice-bridge/accept-any-site', false)
  const companionSite = useLocalStorageManualReset<string>('settings/neoalice-bridge/companion-site', 'companion')
  const username = useLocalStorageManualReset<string>('settings/neoalice-bridge/username', '')
  const password = useLocalStorageManualReset<string>('settings/neoalice-bridge/password', '')
  const speechMode = useLocalStorageManualReset<NeoAliceSpeechMode>('settings/neoalice-bridge/speech-mode', 'silent')
  /** Publishes each phrase of the avatar microphone as `evt/audio` on the site, like a satellite. */
  const voiceInput = useLocalStorageManualReset<boolean>('settings/neoalice-bridge/voice-input', false)
  /** The NeoAlice user UUID of the phrases. Empty: NeoAlice uses its default user. */
  const userId = useLocalStorageManualReset<string>('settings/neoalice-bridge/user-id', '')
  /** Publishes the `evt/state` heartbeat, so NeoAlice lists the avatar as an active satellite. */
  const announceState = useLocalStorageManualReset<boolean>('settings/neoalice-bridge/announce-state', false)
  const voiceStatus = ref<NeoAliceVoiceStatus>('off')
  const voiceError = ref('')
  /** The text of the last reply of NeoAlice. */
  const lastHeard = ref('')

  const status = ref<NeoAliceBridgeStatus>('off')
  const lastError = ref('')
  const receivedCount = ref(0)
  const ignoredCount = ref(0)
  const lastIgnored = ref('')
  const lastEvent = ref('')

  const brain = useNeoAliceBrainStore()
  const configured = computed(() => brokerUrl.value.trim() !== '' && ((acceptAnySite.value && !brain.brainMode) || site.value.trim() !== ''))

  const vrmMotions = useVrmMotionsStore()
  let activeTranslator: NeoAliceTranslator | undefined
  watch(() => vrmMotions.motionLibrary, (library) => {
    activeTranslator?.setCatalog(catalogWithEmotes(library.emotes))
  })

  const eventHook = createEventHook<NeoAliceBridgeEvent>()
  const reconnectHook = createEventHook<void>()
  let client: MqttClient | undefined
  /** Increments on each start and stop, so a late callback of an old client does nothing. */
  let generation = 0
  let holders = 0

  async function connect() {
    disconnect()
    if (!enabled.value || !configured.value || holders === 0)
      return
    const current = ++generation
    status.value = 'connecting'
    lastError.value = ''
    // In the brain mode, AIRI is one satellite: it follows its own site only. Every site would bring the
    // broadcasts of the other satellites, so the same reply arrives once for each site.
    const followAnySite = acceptAnySite.value && !brain.brainMode
    const options = { site: site.value.trim(), acceptAnySite: followAnySite, companionSite: companionSite.value.trim() || 'companion' }
    // Imported VRMA and FBX motions are part of the catalog, so `cmd/avatar/animation` can name them.
    const translator = new NeoAliceTranslator({ ...options, catalog: catalogWithEmotes(vrmMotions.motionLibrary.emotes) })
    activeTranslator = translator

    let connectMqtt: typeof import('mqtt')['connect']
    try {
      connectMqtt = await loadMqttConnect()
    }
    catch (error) {
      status.value = 'error'
      lastError.value = errorMessageFrom(error) ?? 'The MQTT library did not load'
      return
    }
    if (current !== generation)
      return

    let connectedBefore = false
    const next = connectMqtt(brokerUrl.value.trim(), {
      clientId: `airi-neoalice-bridge-${nanoid(8)}`,
      username: username.value || undefined,
      password: password.value || undefined,
      reconnectPeriod: 5000,
      connectTimeout: 10_000,
      clean: true,
    })
    client = next
    next.on('connect', () => {
      if (current !== generation)
        return
      status.value = 'connected'
      lastError.value = ''
      next.subscribe(neoAliceBridgeTopics(options), { qos: 0 }, (error) => {
        if (error && current === generation)
          lastError.value = errorMessageFrom(error) ?? 'Subscription failed'
      })
      if (connectedBefore)
        void reconnectHook.trigger()
      connectedBefore = true
    })
    next.on('reconnect', () => {
      if (current === generation)
        status.value = 'reconnecting'
    })
    next.on('error', (error) => {
      if (current !== generation)
        return
      status.value = 'error'
      lastError.value = errorMessageFrom(error) ?? 'MQTT error'
    })
    next.on('message', (topic, payload) => {
      if (current !== generation)
        return
      receivedCount.value++
      const event = translator.translate(topic, payload.toString(), Date.now())
      if (event.type === 'ignored') {
        ignoredCount.value++
        lastIgnored.value = `${event.topic}: ${event.reason}`
        console.info(`[neoalice-bridge] ignored ${lastIgnored.value}`)
        return
      }
      lastEvent.value = event.type === 'intent' ? `intent ${event.intent.semanticAction}` : event.type
      void eventHook.trigger(event)
    })
  }

  /**
   * Publishes a satellite message of the avatar. Resolves `false` when the bridge is not connected.
   * Only `evt/audio`, `evt/state`, and `evt/stt/final` of the configured site are permitted.
   */
  async function publish(message: NeoAliceSatelliteMessage) {
    const current = client
    const ownSite = site.value.trim()
    if (!current || status.value !== 'connected' || !isPublishableSite(ownSite))
      return false
    const permitted = ['evt/audio', 'evt/state', 'evt/stt/final'].map(action => `neoalice/v1/${ownSite}/${action}`)
    if (!permitted.includes(message.topic))
      throw new Error(`The bridge does not publish on ${message.topic}`)
    await current.publishAsync(message.topic, message.payload, { qos: message.qos })
    return true
  }

  function disconnect() {
    generation++
    client?.end(true)
    client = undefined
    status.value = 'off'
  }

  /** Keeps the connection open until the returned function runs. */
  function hold() {
    holders++
    if (holders === 1)
      void connect()
    let released = false
    return () => {
      if (released)
        return
      released = true
      holders--
      if (holders === 0)
        disconnect()
    }
  }

  // Typing in a settings field changes these values on each key. The bridge reconnects once, after a pause.
  // A manual reset ref triggers on every assignment, even with the same value. The key changes only with a real change.
  const connectionKey = computed(() => JSON.stringify([enabled.value, brokerUrl.value, site.value, acceptAnySite.value, brain.brainMode, companionSite.value, username.value, password.value]))
  watchDebounced(connectionKey, () => {
    if (holders > 0)
      void connect()
  }, { debounce: 500 })

  function resetState() {
    enabled.reset()
    brokerUrl.reset()
    site.reset()
    acceptAnySite.reset()
    companionSite.reset()
    username.reset()
    password.reset()
    speechMode.reset()
    voiceInput.reset()
    userId.reset()
    announceState.reset()
  }

  return {
    enabled,
    brokerUrl,
    site,
    acceptAnySite,
    companionSite,
    username,
    password,
    speechMode,
    voiceInput,
    userId,
    announceState,
    voiceStatus,
    voiceError,
    lastHeard,
    configured,
    status,
    lastError,
    receivedCount,
    ignoredCount,
    lastIgnored,
    lastEvent,
    hold,
    publish,
    reconnect: connect,
    onEvent: eventHook.on,
    onReconnect: reconnectHook.on,
    resetState,
  }
})
