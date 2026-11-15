import { androidControlToolNames, createAndroidControlTools } from '@proj-airi/stage-ui/libs/device-control/android-control-tools'
import { confirmOnDevice } from '@proj-airi/stage-ui/libs/device-control/confirm'
import { createRemoteDeviceGate } from '@proj-airi/stage-ui/libs/device-control/remote-gate'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { useDeviceControlStore } from '@proj-airi/stage-ui/stores/device-control'
import { onScopeDispose, watch } from 'vue'

import { DeviceControl, isAndroidApp } from '../modules/device-control'

/**
 * Gives the chat the tools that read and control the Android screen, only while the user allows it in the settings,
 * and gives NeoAlice a gate for the same tools. Both are off until the user turns them on.
 *
 * Returns the gate for the stage (`deviceToolGate` of `WidgetStage`).
 */
export function useAndroidDeviceControl() {
  const store = useDeviceControlStore()
  const llmTools = useLlmToolsStore()

  const tools = createAndroidControlTools({
    isEnabled: () => store.enabled,
    snapshot: () => DeviceControl.snapshot(),
    act: action => DeviceControl.act(action),
    onActivity: entry => store.record({ source: 'tool', ...entry }),
  })
  const toolIds = tools.map(tool => tool.id)

  // The tools exist only while the master switch is on, so the model does not see them otherwise.
  const stop = watch(() => isAndroidApp() && store.enabled, (on) => {
    llmTools.removeToolsByIds(...toolIds)
    if (on)
      llmTools.addTools(...tools)
  }, { immediate: true })
  onScopeDispose(() => {
    stop()
    llmTools.removeToolsByIds(...toolIds)
  })

  const deviceToolGate = createRemoteDeviceGate({
    names: androidControlToolNames,
    getSettings: () => store.settings,
    confirm: confirmOnDevice,
    onActivity: entry => store.record(entry),
  })

  return { deviceToolGate }
}
