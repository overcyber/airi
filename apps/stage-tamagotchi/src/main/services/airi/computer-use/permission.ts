import type { ComputerUsePermission } from '../../../../shared/eventa/computer-use'

export const defaultComputerUsePermission: ComputerUsePermission = { enabled: false, allowRemote: false, confirmRemote: true }

interface ComputerUsePermissionOptions {
  load: () => ComputerUsePermission | undefined
  save: (permission: ComputerUsePermission) => void
}

/**
 * The permission of the user for the control of the desktop, kept in the main process.
 *
 * The tools ask {@link assertEnabled} on every call, so a switch that the user turns off stops the next call.
 * Turning `enabled` off also turns `allowRemote` off, so a later `enabled` does not bring remote control back.
 */
export class ComputerUsePermissionState {
  private current: ComputerUsePermission
  private readonly listeners = new Set<(permission: ComputerUsePermission) => void>()

  constructor(private readonly options: ComputerUsePermissionOptions) {
    this.current = { ...defaultComputerUsePermission, ...options.load() }
  }

  get(): ComputerUsePermission {
    return { ...this.current }
  }

  update(patch: Partial<ComputerUsePermission>): ComputerUsePermission {
    const next = { ...this.current, ...patch }
    if (!next.enabled)
      next.allowRemote = false
    this.current = next
    this.options.save({ ...next })
    for (const listener of this.listeners)
      listener({ ...next })
    return { ...next }
  }

  onChange(listener: (permission: ComputerUsePermission) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Throws the error that the model reads when the master switch is off. */
  assertEnabled() {
    if (!this.current.enabled)
      throw new Error('Computer control is off. The user can turn it on in Settings, System, Computer control.')
  }
}
