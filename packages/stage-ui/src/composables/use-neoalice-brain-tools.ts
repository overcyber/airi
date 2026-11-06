import type { Conversation } from '@proj-airi/core-agent'
import type { Tool } from '@xsai/shared-chat'

import { errorMessageFrom } from '@moeru/std'

import { useLlmToolsStore } from '../stores/ai/chat-llm/tools'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useNeoAliceBrainStore } from '../stores/modules/neoalice-brain'
import { useTextGeneration } from './text-generation'

/** The tools that the widget pass can call. Only the desktop app registers them. */
export const neoAliceBrainToolNames = ['stage_widgets', 'get_weather', 'image_journal'] as const

/** Replies that arrive this close together are one answer of NeoAlice, so they get one widget pass. */
const replyQuietMs = 2000

const instructions = [
  'You choose the desktop widgets of the voice assistant Alice. You never talk to the user.',
  'Alice already answered. The input has the question of the user, when there is one, and the answer of Alice.',
  'When they talk about the weather of a place, call `get_weather`, then call `stage_widgets` with action `spawn` and componentName `weather`.',
  'When they ask to see a place on a map, call `stage_widgets` with action `spawn` and componentName `map`.',
  'When they ask for a picture or a drawing, call `image_journal`.',
  'When nothing needs a widget, call no tool and write only: none.',
].join('\n')

/** Builds the request of one widget pass. The texts go as data, not as instructions. */
export function createNeoAliceBrainToolConversation(reply: string, userText?: string): Conversation {
  return { turns: [
    { id: 'neoalice-brain-tools-instructions', type: 'system', authority: 'system', content: [{ type: 'text', text: instructions }] },
    { id: 'neoalice-brain-tools-exchange', type: 'user', content: [{ type: 'text', text: JSON.stringify({ user: userText ?? null, alice: reply }) }] },
  ] }
}

/**
 * NeoAlice brain mode, Plan 07 W3: the AIRI chat model opens widgets for the answers of NeoAlice.
 *
 * NeoAlice is the voice and the reply. The AIRI model only reads the exchange and calls the widget, weather, and image
 * tools. Its text is discarded. It runs when the brain mode and the widget setting are on, a chat model is selected,
 * and the app has the tools (the desktop app).
 *
 * Returns:
 * - `noteReply`, which collects the text of one NeoAlice answer and starts one pass after it.
 * - `dispose`, which cancels a waiting pass.
 */
export function useNeoAliceBrainTools() {
  const brain = useNeoAliceBrainStore()
  const consciousness = useConsciousnessStore()
  const llmTools = useLlmToolsStore()
  const { generateText } = useTextGeneration()

  let pendingReply = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = Promise.resolve()

  function loggedTools(): Tool[] {
    return llmTools.getToolsByNames(...neoAliceBrainToolNames).map(tool => ({
      ...tool,
      execute: async (input, options) => {
        console.info(`[neoalice-brain-tools] ${tool.function.name}`)
        return tool.execute(input, options)
      },
    }))
  }

  async function run(reply: string) {
    if (!brain.brainMode || !brain.widgetTools)
      return
    const tools = loggedTools()
    if (tools.length === 0)
      return
    const providerId = consciousness.activeProvider
    const model = consciousness.activeModel
    if (!providerId || !model) {
      console.info('[neoalice-brain-tools] no chat model is selected, so no widget opens')
      return
    }
    try {
      await generateText({ providerId, model })(createNeoAliceBrainToolConversation(reply, brain.takeUserText()), AbortSignal.timeout(90_000), tools)
    }
    catch (error) {
      console.warn('[neoalice-brain-tools] the widget pass failed:', errorMessageFrom(error) ?? 'unknown error')
    }
  }

  function noteReply(text: string) {
    if (!brain.brainMode || !brain.widgetTools || !text.trim())
      return
    pendingReply = pendingReply ? `${pendingReply} ${text}` : text
    clearTimeout(timer)
    timer = setTimeout(() => {
      const reply = pendingReply
      pendingReply = ''
      running = running.then(() => run(reply))
    }, replyQuietMs)
  }

  function dispose() {
    clearTimeout(timer)
    pendingReply = ''
  }

  return { noteReply, dispose }
}
