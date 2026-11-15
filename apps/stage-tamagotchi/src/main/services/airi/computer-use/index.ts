import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { ComputerUsePermissionState } from './permission'

import { join, sep } from 'node:path'

import { binaryPath } from '@auv-js/cli/binary'
import { defineInvokeHandler } from '@moeru/eventa'
import { app } from 'electron'

import { computerUsePermissionChanged, computerUsePermissionGet, computerUsePermissionSet, computerUseReadImage, computerUseRun } from '../../../../shared/eventa/computer-use'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { createComputerUseRuntime } from './runtime'

/** Registers host-owned computer use. The executable is resolved only on the first call. */
export function setupComputerUse(context: ReturnType<typeof createContext>['context'], permission: ComputerUsePermissionState) {
  let runtime: ReturnType<typeof createComputerUseRuntime> | undefined
  let stopped = false
  function getRuntime() {
    if (stopped)
      throw new Error('Computer use has stopped.')
    if (!runtime) {
      const executable = binaryPath()
      runtime = createComputerUseRuntime({
        // Native executables cannot run inside Electron's archive.
        binaryPath: app.isPackaged ? executable.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`) : executable,
        storeRoot: join(app.getPath('userData'), 'computer-use'),
      })
    }
    return runtime
  }
  // The permission is checked on every call, here in the main process, and not only in the settings page.
  defineInvokeHandler(context, computerUseRun, (input) => {
    permission.assertEnabled()
    return getRuntime().run(input)
  })
  defineInvokeHandler(context, computerUseReadImage, (input) => {
    permission.assertEnabled()
    return getRuntime().readImage(input)
  })
  defineInvokeHandler(context, computerUsePermissionGet, () => permission.get())
  defineInvokeHandler(context, computerUsePermissionSet, patch => permission.update(patch))
  const stopListening = permission.onChange((value) => {
    void context.emit(computerUsePermissionChanged, value)
  })
  onAppBeforeQuit(async () => {
    stopped = true
    stopListening()
    await runtime?.dispose()
  })
}
