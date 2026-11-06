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
  /**
   * The AIRI chat model opens widgets for the replies of NeoAlice (Plan 07, W3). It never answers.
   * Only an app with widget tools (the desktop app) uses it.
   */
  const widgetTools = useLocalStorageManualReset<boolean>('settings/neoalice-bridge/widget-tools', true)
  /** The last typed text and when it was sent, so the widget pass sees the question and the reply. */
  let lastUserText: { text: string, atMs: number } | undefined
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
    lastUserText = { text, atMs: Date.now() }
  }

  /** Returns the typed text of the last two minutes once, then forgets it. A voice question gives `undefined`. */
  function takeUserText(nowMs = Date.now()) {
    const last = lastUserText
    lastUserText = undefined
    return last && nowMs - last.atMs < 120_000 ? last.text : undefined
  }

  function resetState() {
    brainMode.reset()
    serverUrl.reset()
    widgetTools.reset()
  }

  return { brainMode, serverUrl, widgetTools, connectTextSink, sendText, takeUserText, resetState }
})
