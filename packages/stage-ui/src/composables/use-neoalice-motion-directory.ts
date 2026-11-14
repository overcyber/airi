import type { CustomMotion } from '@proj-airi/alice-motion'
import type { MqttClient } from 'mqtt'

import { errorMessageFrom } from '@moeru/std'
import { parseCustomMotion } from '@proj-airi/alice-motion'
import { nanoid } from 'nanoid'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'

import { loadMqttConnect, useNeoAliceBridgeStore } from '../stores/modules/neoalice-bridge'

/**
 * The broker side of the motions page: it reads the saved motions of the companion service (retained) and sends a
 * motion command to the mirror when the user presses Play. It uses the broker settings of the NeoAlice bridge.
 */
export function useNeoAliceMotionDirectory() {
  const bridge = useNeoAliceBridgeStore()
  const status = ref<'off' | 'connecting' | 'connected' | 'error'>('off')
  const error = ref('')
  const customMotions = shallowRef<CustomMotion[]>([])
  /** The site that plays the commands: the mood site of the mirror, else the site of the bridge. */
  const targetSite = computed(() => bridge.moodSite.trim() || bridge.site.trim())
  let client: MqttClient | undefined

  async function connect() {
    if (client || !bridge.brokerUrl.trim())
      return
    status.value = 'connecting'
    try {
      const connectMqtt = await loadMqttConnect()
      const next = connectMqtt(bridge.brokerUrl.trim(), {
        clientId: `airi-motions-${nanoid(8)}`,
        username: bridge.username || undefined,
        password: bridge.password || undefined,
        reconnectPeriod: 5000,
        connectTimeout: 10_000,
        clean: true,
      })
      client = next
      const libraryTopic = `neoalice/v1/${bridge.companionSite.trim() || 'companion'}/evt/avatar/motions`
      next.on('connect', () => {
        status.value = 'connected'
        next.subscribe(libraryTopic, { qos: 0 })
      })
      next.on('error', (reason) => {
        status.value = 'error'
        error.value = errorMessageFrom(reason) ?? 'connection failed'
      })
      next.on('message', (topic, payload) => {
        if (topic !== libraryTopic)
          return
        try {
          const items = (JSON.parse(payload.toString()) as { motions?: unknown[] }).motions ?? []
          customMotions.value = items.flatMap((item) => {
            const parsed = parseCustomMotion(item)
            return parsed.ok && parsed.motion.name ? [parsed.motion] : []
          })
        }
        catch {
          customMotions.value = []
        }
      })
    }
    catch (reason) {
      status.value = 'error'
      error.value = errorMessageFrom(reason) ?? 'connection failed'
    }
  }

  /** Publishes a motion command to the mirror. Resolves `false` without a connection or a site. */
  async function send(action: string, payload: Record<string, unknown>) {
    const site = targetSite.value
    if (!client || status.value !== 'connected' || !site || /[/#+\s]/.test(site))
      return false
    await client.publishAsync(`neoalice/v1/${site}/${action}`, JSON.stringify(payload), { qos: 0 })
    return true
  }

  onScopeDispose(() => {
    client?.end(true)
    client = undefined
  })

  return { status, error, customMotions, targetSite, connect, send }
}
