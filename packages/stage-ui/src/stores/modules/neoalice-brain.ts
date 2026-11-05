import { serverDefaultsOrigin } from '@proj-airi/stage-shared'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

/**
 * The NeoAlice brain mode of the Alice fork.
 *
 * On, AIRI is the face of NeoAlice, like the TalkingHead avatar: typed text goes to NeoAlice as
 * `evt/stt/final` on the site of the avatar, and the reply of NeoAlice (`cmd/tts/audio`) is the reply
 * of the chat. The LLM, the speech, and the hearing modules of AIRI do not answer.
 *
 * It is a separate store with no other import, so the chat and the consciousness stores can read it.
 */
export const useNeoAliceBrainStore = defineStore('neoalice-brain', () => {
  const brainMode = useLocalStorageManualReset<boolean>('settings/neoalice-bridge/brain-mode', false)
  /**
   * The Alice Docker server that gives the settings, for example `http://192.0.2.10:4173`.
   * Empty: the server of the page (web app). The desktop app starts with `VITE_AIRI_SERVER_URL`.
   */
  const serverUrl = useLocalStorageManualReset<string>('settings/alice/server-url', serverDefaultsOrigin() ?? '')
  /** The stage that is connected to NeoAlice sends the text. Only one stage plays the bridge. */
  let textSink: ((text: string) => Promise<void>) | undefined

  /** Connects the sender of typed text until the returned function runs. */
  function connectTextSink(sink: (text: string) => Promise<void>) {
    textSink = sink
    return () => {
      if (textSink === sink)
        textSink = undefined
    }
  }

  /** Sends typed text to NeoAlice. It fails when no stage is connected to NeoAlice. */
  async function sendText(text: string) {
    if (!textSink)
      throw new Error('NeoAlice is not connected. Open the stage, and check the NeoAlice bridge settings.')
    await textSink(text)
  }

  function resetState() {
    brainMode.reset()
    serverUrl.reset()
  }

  return { brainMode, serverUrl, connectTextSink, sendText, resetState }
})
