import type { Conversation } from '@proj-airi/core-agent'
import type { Tool } from '@xsai/shared-chat'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLlmToolsStore } from '../stores/ai/chat-llm/tools'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useNeoAliceBrainStore } from '../stores/modules/neoalice-brain'
import { createNeoAliceBrainToolConversation, useNeoAliceBrainTools } from './use-neoalice-brain-tools'
import { readStoredMood } from './use-neoalice-stage-bridge'

const generation = vi.hoisted(() => ({
  calls: [] as Array<{ selection: { providerId: string, model: string }, conversation: Conversation, tools?: Tool[] }>,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ locale: { value: 'en' }, t: (key: string) => key, te: () => false }),
}))

vi.mock('./text-generation', () => ({
  useTextGeneration: () => ({
    generateText: (selection: { providerId: string, model: string }) => async (conversation: Conversation, _signal: AbortSignal, tools?: Tool[]) => {
      generation.calls.push({ selection, conversation, tools })
      return 'none'
    },
  }),
}))

function textOf(conversation: Conversation, index: number) {
  const part = conversation.turns[index].content[0]
  return part.type === 'text' ? part.text : ''
}

describe('createNeoAliceBrainToolConversation', () => {
  it('sends the question and the answer as data after the instructions', () => {
    const conversation = createNeoAliceBrainToolConversation('Em Sao Paulo faz 25 graus.', 'Como esta o tempo?')

    expect(conversation.turns.map(turn => turn.type)).toEqual(['system', 'user'])
    expect(textOf(conversation, 0)).toContain('never talk to the user')
    expect(JSON.parse(textOf(conversation, 1))).toEqual({ user: 'Como esta o tempo?', alice: 'Em Sao Paulo faz 25 graus.' })
  })
})

describe('useNeoAliceBrainTools', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    generation.calls.length = 0
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function setUp(options: { tools?: boolean } = {}) {
    const brain = useNeoAliceBrainStore()
    brain.brainMode = true
    const consciousness = useConsciousnessStore()
    consciousness.activeProvider = 'ollama'
    consciousness.activeModel = 'phi4-mini'
    if (options.tools !== false) {
      useLlmToolsStore().addTools({
        id: 'tamagotchi:get_weather',
        type: 'function',
        function: { name: 'get_weather', description: 'weather', parameters: { type: 'object', properties: {} } },
        execute: async () => '{}',
      })
    }
    return { brain, tools: useNeoAliceBrainTools() }
  }

  it('runs one widget pass for the parts of one answer, with the widget tools', async () => {
    const { tools } = setUp()
    tools.noteReply('Em Sao Paulo')
    await vi.advanceTimersByTimeAsync(500)
    tools.noteReply('faz 25 graus.')
    await vi.advanceTimersByTimeAsync(2500)

    expect(generation.calls).toHaveLength(1)
    expect(generation.calls[0].selection).toEqual({ providerId: 'ollama', model: 'phi4-mini' })
    expect(generation.calls[0].tools?.map(tool => tool.function.name)).toEqual(['get_weather'])
    expect(JSON.parse(textOf(generation.calls[0].conversation, 1)).alice).toBe('Em Sao Paulo faz 25 graus.')
  })

  it('runs no pass when the app has no widget tools, or the setting is off', async () => {
    const { brain, tools } = setUp({ tools: false })
    tools.noteReply('Ola.')
    await vi.advanceTimersByTimeAsync(3000)
    expect(generation.calls).toHaveLength(0)

    useLlmToolsStore().addTools({
      id: 'tamagotchi:stage_widgets',
      type: 'function',
      function: { name: 'stage_widgets', description: 'widgets', parameters: { type: 'object', properties: {} } },
      execute: async () => 'ok',
    })
    brain.widgetTools = false
    tools.noteReply('Ola.')
    await vi.advanceTimersByTimeAsync(3000)
    expect(generation.calls).toHaveLength(0)
  })
})

describe('readStoredMood', () => {
  it('reads a stored mood, and ignores an empty or broken value', () => {
    expect(readStoredMood(JSON.stringify({ emotion: 'sad', intensity: 1, atMs: 5 }))).toEqual({ emotion: 'sad', intensity: 1, atMs: 5 })
    expect(readStoredMood('')).toBeUndefined()
    expect(readStoredMood('{broken')).toBeUndefined()
    expect(readStoredMood(JSON.stringify({ emotion: 'sad' }))).toBeUndefined()
  })
})
