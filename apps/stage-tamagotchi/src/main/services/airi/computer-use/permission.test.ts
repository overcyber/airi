import { describe, expect, it, vi } from 'vitest'

import { ComputerUsePermissionState, defaultComputerUsePermission } from './permission'

function state(stored?: ConstructorParameters<typeof ComputerUsePermissionState>[0]['load'] extends () => infer R ? R : never) {
  const save = vi.fn()
  return { permission: new ComputerUsePermissionState({ load: () => stored, save }), save }
}

describe('computerUsePermissionState', () => {
  it('starts with everything off and refuses the tools', () => {
    const { permission } = state()
    expect(permission.get()).toEqual(defaultComputerUsePermission)
    expect(defaultComputerUsePermission).toEqual({ enabled: false, allowRemote: false, confirmRemote: true })
    expect(() => permission.assertEnabled()).toThrow('Computer control is off')
  })

  it('allows the tools after the user turns the master switch on, and saves each change', () => {
    const { permission, save } = state()
    permission.update({ enabled: true })
    expect(() => permission.assertEnabled()).not.toThrow()
    expect(save).toHaveBeenCalledWith({ enabled: true, allowRemote: false, confirmRemote: true })
  })

  it('turns the remote switch off with the master switch', () => {
    const { permission } = state({ enabled: true, allowRemote: true, confirmRemote: false })
    expect(permission.get().allowRemote).toBe(true)
    permission.update({ enabled: false })
    expect(permission.get()).toEqual({ enabled: false, allowRemote: false, confirmRemote: false })
    permission.update({ enabled: true })
    expect(permission.get().allowRemote).toBe(false)
  })

  it('does not allow the remote switch while the master switch is off', () => {
    const { permission } = state()
    expect(permission.update({ allowRemote: true }).allowRemote).toBe(false)
  })

  it('tells the listeners and stops when they unsubscribe', () => {
    const { permission } = state()
    const listener = vi.fn()
    const stop = permission.onChange(listener)
    permission.update({ enabled: true })
    stop()
    permission.update({ enabled: false })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ enabled: true, allowRemote: false, confirmRemote: true })
  })

  it('keeps a copy, so the caller cannot change the state', () => {
    const { permission } = state()
    const copy = permission.get()
    copy.enabled = true
    expect(permission.get().enabled).toBe(false)
  })
})
