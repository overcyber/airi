import { boolean, object } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

/** The permission of the user for the control of the desktop. All off until the user turns it on. */
export function createComputerUsePermissionConfig() {
  const config = createConfig('computer-use-permission', 'options.json', object({
    enabled: boolean(),
    allowRemote: boolean(),
    confirmRemote: boolean(),
  }), {
    default: { enabled: false, allowRemote: false, confirmRemote: true },
    autoHeal: true,
  })
  config.setup()
  return config
}
