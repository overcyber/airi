import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

/** AUV invocation result. A zero exit code does not verify the requested UI effect. */
export interface ComputerUseResult {
  argv: string[]
  exitCode: number
  output: unknown
  stderr: string
}

export const computerUseRun = defineInvokeEventa<ComputerUseResult, { argv: string[] }>('eventa:invoke:computer-use:run')
export const computerUseReadImage = defineInvokeEventa<string, { path: string }>('eventa:invoke:computer-use:read-image')

/**
 * Whether an AUV call asks for help. AUV prints help as text, so the host runs it without `--json`, and the chat shows it as help.
 *
 * @example
 * isComputerUseHelpCall(['invoke', 'input.keys', '-h'])
 * // => true
 */
export function isComputerUseHelpCall(argv: readonly string[]) {
  return argv.includes('--help') || argv.includes('-h') || argv[1] === 'help'
}

/**
 * What the user allows for the control of the desktop. All off at first.
 *
 * The main process keeps and enforces it. The chat tools stop with an error while `enabled` is off.
 */
export interface ComputerUsePermission {
  /** The master switch. Off: the tools `computer_use` and `computer_use_read_image` refuse every call. */
  enabled: boolean
  /** NeoAlice can control the desktop with MQTT commands. The broker has no password, so this is its own switch. */
  allowRemote: boolean
  /** Each command of NeoAlice waits for a yes on the screen. */
  confirmRemote: boolean
}

export const computerUsePermissionGet = defineInvokeEventa<ComputerUsePermission>('eventa:invoke:computer-use:permission:get')
export const computerUsePermissionSet = defineInvokeEventa<ComputerUsePermission, Partial<ComputerUsePermission>>('eventa:invoke:computer-use:permission:set')
export const computerUsePermissionChanged = defineEventa<ComputerUsePermission>('eventa:event:computer-use:permission:changed')
