import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { useDeviceControlStore } from './device-control'

describe('useDeviceControlStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('starts with everything off, and asks before a command of NeoAlice', () => {
    const store = useDeviceControlStore()
    expect(store.settings).toEqual({ enabled: false, allowRemote: false, confirmRemote: true })
  })

  it('does not allow the remote switch without the master switch, and turns it off with the master switch', async () => {
    const store = useDeviceControlStore()
    store.allowRemote = true
    expect(store.settings.allowRemote).toBe(false)
    store.enabled = true
    expect(store.settings.allowRemote).toBe(true)
    // The user turns the switches one after the other, so the store sees each change.
    await nextTick()
    store.enabled = false
    await nextTick()
    expect(store.allowRemote, 'the remote switch goes off with the master switch').toBe(false)
    store.enabled = true
    await nextTick()
    expect(store.settings.allowRemote, 'the remote switch does not come back').toBe(false)
  })

  it('keeps the 30 latest actions, newest first', () => {
    const store = useDeviceControlStore()
    for (let index = 0; index < 35; index++)
      store.record({ source: 'chat', tool: 'android_screen_act', summary: `press ${index}`, ok: true })
    expect(store.activity).toHaveLength(30)
    expect(store.activity[0].summary).toBe('press 34')
  })

  it('remembers the switches in the storage and forgets the actions on reset', async () => {
    const store = useDeviceControlStore()
    store.enabled = true
    await nextTick()
    store.record({ source: 'chat', tool: 'android_screen_read', summary: 'read the screen', ok: true })
    expect(localStorage.getItem('settings/device-control/enabled')).toBe('true')
    store.resetState()
    expect(store.enabled).toBe(false)
    expect(store.activity).toEqual([])
  })
})
