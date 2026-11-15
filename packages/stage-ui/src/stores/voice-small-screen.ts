import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

/**
 * Lets a small screen, like a phone, listen continuously, so a wake word can work there.
 *
 * Off by default. A small screen has no control for continuous listening, so by default only a voice call listens.
 * Turn it on only if you want the phone to keep the microphone open while the app is in front. The app does not
 * listen while it is in the background, because the system stops the microphone of a web page then.
 */
export const useSmallScreenListeningStore = defineStore('voice-small-screen', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/hearing/continuous-on-small-screens', false)

  function resetState() {
    enabled.reset()
  }

  return { enabled, resetState }
})
