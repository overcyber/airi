import type { DeviceControlSettings, DeviceControlSource } from '../libs/device-control/policy'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { defaultDeviceControlSettings } from '../libs/device-control/policy'

export interface DeviceControlActivity {
  at: number
  /** `chat` and `neoalice` asked. `tool` is the result of an action that a tool did. */
  source: DeviceControlSource | 'tool'
  tool: string
  summary: string
  ok: boolean
  error?: string
}

const maxActivity = 30

/**
 * What the user allows for the control of this device, and the latest actions, for the settings page.
 *
 * Everything is off until the user turns it on. Turning the master switch off also turns the remote switch off, so
 * turning the master switch on later does not bring remote control back.
 */
export const useDeviceControlStore = defineStore('device-control', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/device-control/enabled', defaultDeviceControlSettings.enabled)
  const allowRemote = useLocalStorageManualReset<boolean>('settings/device-control/allow-remote', defaultDeviceControlSettings.allowRemote)
  const confirmRemote = useLocalStorageManualReset<boolean>('settings/device-control/confirm-remote', defaultDeviceControlSettings.confirmRemote)
  const activity = ref<DeviceControlActivity[]>([])

  const settings = computed<DeviceControlSettings>(() => ({
    enabled: enabled.value,
    allowRemote: enabled.value && allowRemote.value,
    confirmRemote: confirmRemote.value,
  }))

  watch(enabled, (on) => {
    if (!on)
      allowRemote.value = false
  })

  /** Keeps one line for the list of the latest actions. A line never holds typed text. */
  function record(entry: Omit<DeviceControlActivity, 'at'>) {
    activity.value = [{ at: Date.now(), ...entry }, ...activity.value].slice(0, maxActivity)
  }

  function resetState() {
    enabled.reset()
    allowRemote.reset()
    confirmRemote.reset()
    activity.value = []
  }

  return { enabled, allowRemote, confirmRemote, settings, activity, record, resetState }
})
