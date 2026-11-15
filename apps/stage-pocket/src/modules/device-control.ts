import type { AndroidAction, AndroidActionResult, ScreenSnapshot } from '@proj-airi/stage-ui/libs/device-control/android-actions'

import { Capacitor, registerPlugin } from '@capacitor/core'

export interface DeviceControlStatus {
  /** The user turned the AIRI accessibility service on in the system settings. */
  enabledInSystem: boolean
  /** The service runs now. */
  running: boolean
}

interface DeviceControlPlugin {
  status: () => Promise<DeviceControlStatus>
  openAccessibilitySettings: () => Promise<void>
  snapshot: () => Promise<ScreenSnapshot>
  act: (action: AndroidAction) => Promise<AndroidActionResult>
}

/** The native bridge to the AIRI accessibility service (`DeviceControlPlugin.kt`). Only the Android app has it. */
export const DeviceControl = registerPlugin<DeviceControlPlugin>('DeviceControl')

/** `true` in the Android app. The iOS app and the web page have no phone control. */
export function isAndroidApp() {
  return Capacitor.getPlatform() === 'android'
}
