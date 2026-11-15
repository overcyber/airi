import type { ExecutableTool } from '../../stores/ai/chat-llm/tools'
import type { AndroidAction, AndroidActionResult, ScreenSnapshot } from './android-actions'

import { errorMessageFrom } from '@moeru/std'

import { describeAndroidAction, parseAndroidAction } from './android-actions'

export const androidScreenReadToolName = 'android_screen_read'
export const androidScreenActToolName = 'android_screen_act'

/** The tools of the Android device. NeoAlice can run these two only when the user allows remote control. */
export const androidControlToolNames: readonly string[] = [androidScreenReadToolName, androidScreenActToolName]

const readDescription = [
  'Read the screen of the Android phone as a list of views, with the text, the place in pixels, and what each view can do.',
  'Use it before android_screen_act, because the "id" of a view is valid only until the next read.',
  'The text of a password field is never sent.',
].join(' ')

const actDescription = [
  'Do one action on the Android phone: tap, long_press, swipe, click_node, set_text, scroll, key, or open_app.',
  'Prefer click_node and set_text with the "id" from android_screen_read. Use tap with x and y only when a view has no id.',
  'key is one of back, home, recents, notifications. open_app takes the package name.',
  'After an action, call android_screen_read to check the result. An action can fail with ok false and an error.',
].join(' ')

export interface AndroidControlHooks {
  /** `false` while the master switch is off. The tools then refuse. */
  isEnabled: () => boolean
  snapshot: () => Promise<ScreenSnapshot>
  act: (action: AndroidAction) => Promise<AndroidActionResult>
  /** Called for every action, to keep the activity list. */
  onActivity?: (entry: { tool: string, summary: string, ok: boolean, error?: string }) => void
}

const refused = { ok: false, error: 'device control is off in the settings' }

/**
 * The tools of the LLM for the Android screen: `android_screen_read` and `android_screen_act`.
 *
 * Register them only on the Android app. The master switch is checked on every call, so a switch that the user
 * turns off stops the next call.
 */
export function createAndroidControlTools(hooks: AndroidControlHooks): ExecutableTool[] {
  return [
    {
      id: 'android-screen-read',
      type: 'function',
      function: { name: androidScreenReadToolName, description: readDescription, parameters: { type: 'object', properties: {}, additionalProperties: false } },
      execute: async () => {
        if (!hooks.isEnabled())
          return refused
        try {
          const snapshot = await hooks.snapshot()
          hooks.onActivity?.({ tool: androidScreenReadToolName, summary: `read ${snapshot.nodes.length} views of ${snapshot.packageName}`, ok: true })
          return { ok: true, ...snapshot }
        }
        catch (error) {
          const message = errorMessageFrom(error) ?? 'the screen could not be read'
          hooks.onActivity?.({ tool: androidScreenReadToolName, summary: 'read the screen', ok: false, error: message })
          return { ok: false, error: message }
        }
      },
    },
    {
      id: 'android-screen-act',
      type: 'function',
      function: {
        name: androidScreenActToolName,
        description: actDescription,
        parameters: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['tap', 'long_press', 'swipe', 'click_node', 'set_text', 'scroll', 'key', 'open_app'] },
            x: { type: 'number' },
            y: { type: 'number' },
            x1: { type: 'number' },
            y1: { type: 'number' },
            x2: { type: 'number' },
            y2: { type: 'number' },
            durationMs: { type: 'number' },
            id: { type: 'number', description: 'the id of a view from android_screen_read' },
            text: { type: 'string' },
            direction: { type: 'string', enum: ['forward', 'backward'] },
            key: { type: 'string', enum: ['back', 'home', 'recents', 'notifications'] },
            packageName: { type: 'string' },
          },
          required: ['type'],
        },
      },
      execute: async (input: unknown) => {
        if (!hooks.isEnabled())
          return refused
        const parsed = parseAndroidAction(input)
        if (!parsed.ok)
          return { ok: false, error: parsed.error }
        const summary = describeAndroidAction(parsed.action)
        try {
          const result = await hooks.act(parsed.action)
          hooks.onActivity?.({ tool: androidScreenActToolName, summary, ok: result.ok, error: result.error })
          return result
        }
        catch (error) {
          const message = errorMessageFrom(error) ?? 'the action failed'
          hooks.onActivity?.({ tool: androidScreenActToolName, summary, ok: false, error: message })
          return { ok: false, error: message }
        }
      },
    },
  ]
}
