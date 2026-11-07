import type { Tool } from '@xsai/shared-chat'

import { describe, expect, it, vi } from 'vitest'

import { runNeoAliceTool, widgetToolInput } from './neoalice-tools'

function fakeTool(name: string, execute: Tool['execute']): Tool {
  return { type: 'function', function: { name, description: name, parameters: {} }, execute } as Tool
}

describe('neoAlice tools (Plan 07, W4)', () => {
  it('runs a permitted tool and refuses computer_use and unknown tools', async () => {
    const weather = fakeTool('get_weather', vi.fn(async () => ({ temp: 25 })))
    const computer = fakeTool('computer_use', vi.fn(async () => 'clicked'))
    const find = (name: string) => [weather, computer].find(tool => tool.function.name === name)

    expect(await runNeoAliceTool(find, 'get_weather', { city: 'Rio' }, 'r1')).toEqual({ ok: true, result: { temp: 25 } })
    expect(await runNeoAliceTool(find, 'computer_use', {}, 'r2')).toEqual({ ok: false, error: 'the tool computer_use is not permitted from NeoAlice' })
    expect(computer.execute).not.toHaveBeenCalled()
    expect(await runNeoAliceTool(find, 'stage_widgets', {}, 'r3')).toMatchObject({ ok: false })
  })

  it('reports a tool that fails, without throwing', async () => {
    const broken = fakeTool('image_journal', async () => {
      throw new Error('no image provider')
    })
    expect(await runNeoAliceTool(() => broken, 'image_journal', {}, 'r4')).toEqual({ ok: false, error: 'no image provider' })
  })

  it('turns a widget command into the stage_widgets input', () => {
    expect(widgetToolInput({ type: 'widget', site: 'airi-avatar', action: 'spawn', widget: 'weather', props: { city: 'Rio' }, ttlSeconds: 30 }))
      .toEqual({ action: 'spawn', id: '', componentName: 'weather', componentProps: '{"city":"Rio"}', alwaysOnTop: false, size: 'm', windowSize: null, ttlSeconds: 30 })
  })
})
