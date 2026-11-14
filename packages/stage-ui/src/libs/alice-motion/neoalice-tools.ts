import type { NeoAliceBridgeEvent } from '@proj-airi/alice-motion'
import type { Tool } from '@xsai/shared-chat'

import { errorMessageFrom } from '@moeru/std'

/**
 * The tools that NeoAlice can run on the avatar with `cmd/avatar/tool` (Plan 07, W4).
 *
 * The broker has no access control, so any device of the network can publish. `computer_use` (keyboard and
 * mouse) is never on this list: it needs a confirmation on the screen. `avatar_motion` only moves the avatar,
 * within the limits of its bones.
 */
export const neoAliceToolAllowlist: readonly string[] = ['get_weather', 'stage_widgets', 'image_journal', 'avatar_motion', 'avatar_rig']

type WidgetEvent = Extract<NeoAliceBridgeEvent, { type: 'widget' }>

/** The input of the `stage_widgets` tool of the desktop app for a `cmd/avatar/widget`. */
export function widgetToolInput(event: WidgetEvent): Record<string, unknown> {
  return {
    action: event.action,
    id: event.id ?? '',
    componentName: event.widget ?? '',
    componentProps: JSON.stringify(event.props),
    alwaysOnTop: false,
    size: 'm',
    windowSize: null,
    ttlSeconds: event.ttlSeconds ?? 0,
  }
}

export type NeoAliceToolResult = { ok: true, result: unknown } | { ok: false, error: string }

/**
 * Runs one permitted tool of the app. A tool outside {@link neoAliceToolAllowlist}, or one that this app does not
 * have (the web app has no widgets), gives `ok: false` with the reason. It never throws.
 */
export async function runNeoAliceTool(findTool: (name: string) => Tool | undefined, name: string, args: Record<string, unknown>, requestId: string): Promise<NeoAliceToolResult> {
  if (!neoAliceToolAllowlist.includes(name))
    return { ok: false, error: `the tool ${name} is not permitted from NeoAlice` }
  const tool = findTool(name)
  if (!tool)
    return { ok: false, error: `this app has no ${name} tool (widgets and tools need the desktop app)` }
  try {
    return { ok: true, result: await tool.execute(args, { messages: [], toolCallId: requestId }) }
  }
  catch (error) {
    return { ok: false, error: errorMessageFrom(error) ?? 'the tool failed' }
  }
}
