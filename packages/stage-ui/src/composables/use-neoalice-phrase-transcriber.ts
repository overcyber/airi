import type { SpeechSegment } from '@proj-airi/alice-motion'
import type { TranscriptionProvider } from '@xsai-ext/providers/utils'

import { toWav } from '@proj-airi/audio/encoding'

import { useHearingStore } from '../stores/modules/hearing'
import { useProviderStore } from '../stores/providers/provider'

/**
 * Transcribes one phrase of the avatar microphone with the transcription provider of the Hearing module.
 *
 * The NeoAlice wake word (Plan 06, F2) needs the text on the avatar, to find the wake word before
 * anything goes to NeoAlice. The Alice deployment sets the local Whisper of the server as the default provider.
 *
 * Returns:
 * - `transcribe`, which resolves to the text of the phrase. It rejects when Hearing has no provider and model.
 */
export function useNeoAlicePhraseTranscriber() {
  const hearing = useHearingStore()
  const providers = useProviderStore()

  async function transcribe(segment: SpeechSegment, signal?: AbortSignal): Promise<string> {
    const providerId = hearing.activeTranscriptionProvider
    const model = hearing.activeTranscriptionModel
    if (!providerId || !model)
      throw new Error('The wake word needs a transcription provider and model in Settings, Hearing.')
    const provider = await providers.getProviderInstance<TranscriptionProvider>(providerId)
    const wav = toWav(segment.samples.buffer, segment.sampleRate)
    const file = new File([wav], 'phrase.wav', { type: 'audio/wav' })
    const result = await hearing.transcription(providerId, provider, model, file, undefined, { signal })
    return result.mode === 'generate' ? result.text : await result.text
  }

  return { transcribe }
}
