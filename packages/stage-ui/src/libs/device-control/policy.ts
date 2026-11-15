/** Who asks for an action on the device: the chat of the app, or NeoAlice through MQTT. */
export type DeviceControlSource = 'chat' | 'neoalice'

/** The permissions that the user gives in the settings. Everything is off until the user turns it on. */
export interface DeviceControlSettings {
  /** The master switch. Off: no tool reads or controls the device. */
  enabled: boolean
  /** NeoAlice can control the device with MQTT commands. The broker has no password, so this is a separate switch. */
  allowRemote: boolean
  /** Each command of NeoAlice waits for a yes on the device screen. */
  confirmRemote: boolean
}

export const defaultDeviceControlSettings: DeviceControlSettings = { enabled: false, allowRemote: false, confirmRemote: true }

export type DeviceControlDecision
  = | { allowed: true, needsConfirmation: boolean }
    | { allowed: false, reason: string }

/**
 * Decides if one request may run.
 *
 * The chat needs the master switch. NeoAlice needs the master switch and the remote switch.
 *
 * @example
 * decideDeviceControl({ enabled: true, allowRemote: false, confirmRemote: true }, 'neoalice')
 * // => { allowed: false, reason: 'remote control is off in the settings' }
 */
export function decideDeviceControl(settings: DeviceControlSettings, source: DeviceControlSource): DeviceControlDecision {
  if (!settings.enabled)
    return { allowed: false, reason: 'device control is off in the settings' }
  if (source === 'chat')
    return { allowed: true, needsConfirmation: false }
  if (!settings.allowRemote)
    return { allowed: false, reason: 'remote control is off in the settings' }
  return { allowed: true, needsConfirmation: settings.confirmRemote }
}

/**
 * Limits how many actions run in a time window. A loop or a flood of MQTT commands cannot move the device
 * without end.
 */
export class ActionRateLimiter {
  private readonly times: number[] = []

  constructor(private readonly max: number, private readonly windowMs: number) {}

  /** Returns `true` and counts the action when the window has room. */
  tryTake(nowMs: number): boolean {
    while (this.times.length > 0 && nowMs - this.times[0] >= this.windowMs)
      this.times.shift()
    if (this.times.length >= this.max)
      return false
    this.times.push(nowMs)
    return true
  }
}
