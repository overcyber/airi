/**
 * Asks the user a yes or no question on the device screen, for a command of NeoAlice. `true` means yes.
 *
 * Without a window to ask in, for example in a test, it answers no, so a command never runs without an answer.
 */
export function confirmOnDevice(message: string): boolean {
  // NOTICE:
  // Native confirm asks the user before NeoAlice moves the device.
  // Root cause: `no-alert` rejects direct `confirm(...)` calls, and the app has no shared confirmation dialog
  // that the stage windows of the desktop and the phone can open from a tool call.
  // Source/context: the same guard in packages/stage-pages card-detail.vue.
  // Removal condition: replace with the shared modal confirmation component.
  const confirmAction = globalThis.confirm?.bind(globalThis)
  return confirmAction ? confirmAction(message) : false
}
