import type { DeviceToolGate } from '../alice-motion/neoalice-tools'
import type { DeviceControlSettings } from './policy'

import { describeAndroidAction, parseAndroidAction } from './android-actions'
import { androidScreenActToolName, androidScreenReadToolName } from './android-control-tools'
import { ActionRateLimiter, decideDeviceControl } from './policy'

/** The desktop tools that the remote gate also decides. */
export const desktopControlToolNames: readonly string[] = ['computer_use', 'computer_use_read_image']

export interface RemoteDeviceGateOptions {
  /** The tool names to decide, for example the Android tools on the phone, or the desktop tools on the desktop. */
  names: readonly string[]
  /** Reads the settings at the time of the call, so a switch that the user turns off works at once. */
  getSettings: () => DeviceControlSettings | Promise<DeviceControlSettings>
  /** Asks the user on the device screen. `true` means yes. */
  confirm: (description: string) => boolean | Promise<boolean>
  /** Most commands in the window. */
  maxCommands?: number
  windowMs?: number
  now?: () => number
  onActivity?: (entry: { source: 'neoalice', tool: string, summary: string, ok: boolean, error?: string }) => void
}

/** One line that tells the user what the command does. It never holds typed text. */
export function describeRemoteCommand(name: string, args: Record<string, unknown>): string {
  if (name === androidScreenReadToolName)
    return 'read the screen'
  if (name === androidScreenActToolName) {
    const parsed = parseAndroidAction(args)
    return parsed.ok ? describeAndroidAction(parsed.action) : 'an action that the app cannot read'
  }
  if (name === 'computer_use') {
    const argv = Array.isArray(args.argv) ? args.argv.filter((item): item is string => typeof item === 'string') : []
    return `run the desktop command ${argv.slice(1, 3).join(' ') || 'unknown'}`
  }
  return `use ${name}`
}

/**
 * The gate for the commands of NeoAlice that control the device.
 *
 * A command runs only when the master switch and the remote switch are on, the rate limit has room, and, when the
 * user asked for it, the user says yes on the device. Every answer goes to `onActivity`.
 */
export function createRemoteDeviceGate(options: RemoteDeviceGateOptions): DeviceToolGate {
  const limiter = new ActionRateLimiter(options.maxCommands ?? 20, options.windowMs ?? 60_000)
  const now = options.now ?? Date.now
  return {
    names: options.names,
    check: async (name, args) => {
      const summary = describeRemoteCommand(name, args)
      const refuse = (error: string) => {
        options.onActivity?.({ source: 'neoalice', tool: name, summary, ok: false, error })
        return { ok: false as const, error }
      }
      const decision = decideDeviceControl(await options.getSettings(), 'neoalice')
      if (!decision.allowed)
        return refuse(decision.reason)
      if (!limiter.tryTake(now()))
        return refuse('too many commands from NeoAlice in the last minute')
      if (decision.needsConfirmation && !(await options.confirm(`NeoAlice asks to ${summary}. Allow it?`)))
        return refuse('the user said no')
      return { ok: true as const }
    },
  }
}
