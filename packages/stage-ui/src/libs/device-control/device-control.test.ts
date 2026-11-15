import type { Tool } from '@xsai/shared-chat'

import { describe, expect, it, vi } from 'vitest'

import { runNeoAliceTool } from '../alice-motion/neoalice-tools'
import { describeAndroidAction, parseAndroidAction } from './android-actions'
import { androidControlToolNames, createAndroidControlTools } from './android-control-tools'
import { ActionRateLimiter, decideDeviceControl, defaultDeviceControlSettings } from './policy'
import { createRemoteDeviceGate, describeRemoteCommand, desktopControlToolNames } from './remote-gate'

const on = { enabled: true, allowRemote: true, confirmRemote: false }

describe('decideDeviceControl', () => {
  it('starts with everything off', () => {
    expect(defaultDeviceControlSettings).toEqual({ enabled: false, allowRemote: false, confirmRemote: true })
    expect(decideDeviceControl(defaultDeviceControlSettings, 'chat')).toMatchObject({ allowed: false })
    expect(decideDeviceControl(defaultDeviceControlSettings, 'neoalice')).toMatchObject({ allowed: false })
  })

  it('lets the chat use the master switch alone, and NeoAlice need the remote switch too', () => {
    expect(decideDeviceControl({ ...on, allowRemote: false }, 'chat')).toEqual({ allowed: true, needsConfirmation: false })
    expect(decideDeviceControl({ ...on, allowRemote: false }, 'neoalice')).toEqual({ allowed: false, reason: 'remote control is off in the settings' })
    expect(decideDeviceControl({ enabled: false, allowRemote: true, confirmRemote: false }, 'neoalice')).toMatchObject({ allowed: false })
  })

  it('asks for a confirmation of NeoAlice only when the user wants it', () => {
    expect(decideDeviceControl({ ...on, confirmRemote: true }, 'neoalice')).toEqual({ allowed: true, needsConfirmation: true })
    expect(decideDeviceControl(on, 'neoalice')).toEqual({ allowed: true, needsConfirmation: false })
  })
})

describe('actionRateLimiter', () => {
  it('refuses the action after the limit and accepts again when the window moves', () => {
    const limiter = new ActionRateLimiter(2, 1000)
    expect(limiter.tryTake(0)).toBe(true)
    expect(limiter.tryTake(100)).toBe(true)
    expect(limiter.tryTake(200)).toBe(false)
    expect(limiter.tryTake(1000)).toBe(true)
  })
})

describe('parseAndroidAction', () => {
  it('reads each action and describes it without the typed text', () => {
    const typed = parseAndroidAction({ type: 'set_text', id: 3, text: 'secret words' })
    expect(typed).toMatchObject({ ok: true })
    expect(typed.ok && describeAndroidAction(typed.action)).toBe('type 12 characters in view 3')
    expect(parseAndroidAction({ type: 'key', key: 'back' })).toEqual({ ok: true, action: { type: 'key', key: 'back' } })
    expect(parseAndroidAction({ type: 'open_app', packageName: 'com.example.mail' })).toMatchObject({ ok: true })
  })

  it('refuses a bad action', () => {
    expect(parseAndroidAction({ type: 'format_disk' })).toMatchObject({ ok: false })
    expect(parseAndroidAction({ type: 'tap', x: -1, y: 5 })).toMatchObject({ ok: false })
    expect(parseAndroidAction({ type: 'key', key: 'power' })).toMatchObject({ ok: false })
    expect(parseAndroidAction({ type: 'open_app', packageName: 'not a package; rm' })).toMatchObject({ ok: false })
    expect(parseAndroidAction({ type: 'set_text', text: 'x'.repeat(2001) })).toMatchObject({ ok: false })
  })
})

describe('android control tools', () => {
  const snapshot = { packageName: 'com.example.mail', width: 1080, height: 2400, nodes: [], truncated: false }
  function tools(enabled: boolean) {
    const act = vi.fn(async () => ({ ok: true }))
    const onActivity = vi.fn()
    const list = createAndroidControlTools({ isEnabled: () => enabled, snapshot: async () => snapshot, act, onActivity })
    const find = (name: string) => list.find(tool => tool.function.name === name)!
    return { act, onActivity, find }
  }
  const call = (tool: Tool, input: unknown) => tool.execute(input, { messages: [], toolCallId: 't' })

  it('refuses both tools while the master switch is off', async () => {
    const { find, act } = tools(false)
    expect(await call(find('android_screen_read'), {})).toEqual({ ok: false, error: 'device control is off in the settings' })
    expect(await call(find('android_screen_act'), { type: 'key', key: 'home' })).toMatchObject({ ok: false })
    expect(act).not.toHaveBeenCalled()
  })

  it('reads the screen and runs a checked action', async () => {
    const { find, act, onActivity } = tools(true)
    expect(await call(find('android_screen_read'), {})).toMatchObject({ ok: true, packageName: 'com.example.mail' })
    expect(await call(find('android_screen_act'), { type: 'key', key: 'back' })).toEqual({ ok: true })
    expect(act).toHaveBeenCalledWith({ type: 'key', key: 'back' })
    expect(onActivity).toHaveBeenCalledTimes(2)
  })

  it('does not run an action that fails the check', async () => {
    const { find, act } = tools(true)
    expect(await call(find('android_screen_act'), { type: 'tap', x: 'left', y: 1 })).toMatchObject({ ok: false })
    expect(act).not.toHaveBeenCalled()
  })
})

describe('remote device gate and runNeoAliceTool', () => {
  const fakeTool = (name: string, execute: Tool['execute']) => ({ type: 'function', function: { name, description: name, parameters: {} }, execute }) as Tool

  function setup(settings: typeof on, answer = true) {
    const run = vi.fn(async () => 'done')
    const confirm = vi.fn(async () => answer)
    const onActivity = vi.fn()
    const gate = createRemoteDeviceGate({ names: androidControlToolNames, getSettings: () => settings, confirm, onActivity })
    const find = (name: string) => fakeTool(name, run)
    return { run, confirm, onActivity, gate, find }
  }

  it('refuses the Android tools without a gate, like before', async () => {
    const { find, run } = setup(on)
    expect(await runNeoAliceTool(find, 'android_screen_act', { type: 'key', key: 'home' }, 'r1')).toEqual({ ok: false, error: 'the tool android_screen_act is not permitted from NeoAlice' })
    expect(run).not.toHaveBeenCalled()
  })

  it('refuses while the remote switch is off', async () => {
    const { find, run, gate, onActivity } = setup({ ...on, allowRemote: false })
    expect(await runNeoAliceTool(find, 'android_screen_read', {}, 'r2', gate)).toEqual({ ok: false, error: 'remote control is off in the settings' })
    expect(run).not.toHaveBeenCalled()
    expect(onActivity).toHaveBeenCalledWith(expect.objectContaining({ ok: false, tool: 'android_screen_read' }))
  })

  it('runs the tool when the user allowed it, and asks first when the user wants that', async () => {
    const allowed = setup(on)
    expect(await runNeoAliceTool(allowed.find, 'android_screen_read', {}, 'r3', allowed.gate)).toEqual({ ok: true, result: 'done' })
    expect(allowed.confirm).not.toHaveBeenCalled()

    const asked = setup({ ...on, confirmRemote: true }, false)
    expect(await runNeoAliceTool(asked.find, 'android_screen_act', { type: 'key', key: 'home' }, 'r4', asked.gate)).toEqual({ ok: false, error: 'the user said no' })
    expect(asked.confirm).toHaveBeenCalledWith('NeoAlice asks to press home. Allow it?')
    expect(asked.run).not.toHaveBeenCalled()
  })

  it('does not decide a tool that is not in its names, and keeps the old allowlist', async () => {
    const { find, gate } = setup(on)
    expect(await runNeoAliceTool(find, 'computer_use', {}, 'r5', gate)).toEqual({ ok: false, error: 'the tool computer_use is not permitted from NeoAlice' })
  })

  it('stops a flood of commands', async () => {
    const run = vi.fn(async () => 'done')
    const gate = createRemoteDeviceGate({ names: ['android_screen_read'], getSettings: () => on, confirm: () => true, maxCommands: 2, now: () => 0 })
    const find = (name: string) => fakeTool(name, run)
    await runNeoAliceTool(find, 'android_screen_read', {}, 'a', gate)
    await runNeoAliceTool(find, 'android_screen_read', {}, 'b', gate)
    expect(await runNeoAliceTool(find, 'android_screen_read', {}, 'c', gate)).toEqual({ ok: false, error: 'too many commands from NeoAlice in the last minute' })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('describes desktop and Android commands for the confirmation', () => {
    expect(desktopControlToolNames).toContain('computer_use')
    expect(describeRemoteCommand('computer_use', { argv: ['invoke', 'input.click', '--x', '1'] })).toBe('run the desktop command input.click --x')
    expect(describeRemoteCommand('android_screen_act', { type: 'set_text', text: 'abc' })).toBe('type 3 characters in the focused field')
  })
})
