import type { NeoAliceWakeWordFacts, WakeWordFacts } from '../libs/voice/wake-word-diagnostics'

import { computed } from 'vue'

import { diagnoseNeoAliceWakeWord, diagnoseWakeWord, wakeWordCanRun } from '../libs/voice/wake-word-diagnostics'
import { useHearingStore } from '../stores/modules/hearing'
import { useNeoAliceBridgeStore } from '../stores/modules/neoalice-bridge'
import { useSettingsAudioDevice } from '../stores/settings/audio-device'
import { useVoiceControlsStore } from '../stores/voice-controls'
import { useWakeWordDetectionStore } from '../stores/wake-word-detection'
import { useWakeWordsStore } from '../stores/wake-words'

/**
 * The check of the wake word of the AIRI detector, from the real state of the stores.
 *
 * It reads the detector as the voice host reports it, because the host window owns the detector.
 */
export function useWakeWordDiagnostics() {
  const wakeWords = useWakeWordsStore()
  const detection = useWakeWordDetectionStore()
  const hearing = useHearingStore()
  const devices = useSettingsAudioDevice()
  const voiceControls = useVoiceControlsStore()

  const facts = computed<WakeWordFacts>(() => {
    const host = voiceControls.snapshot.wakeWords
    return {
      hasActivePronunciation: detection.pronunciations.length > 0,
      hasUnresolvedConflict: wakeWords.catalog.conflicts.some(conflict => !conflict.owner),
      hearingEnabled: hearing.enabled,
      microphoneOff: devices.off,
      listeningPreference: devices.enabled,
      inputMode: hearing.inputMode,
      continuousAllowed: devices.continuousAllowed,
      transcriptionConfigured: hearing.configured,
      preparation: host?.preparation ?? 'unconfigured',
      preparationError: host?.error,
    }
  })
  const findings = computed(() => diagnoseWakeWord(facts.value))
  return { findings, canRun: computed(() => wakeWordCanRun(findings.value)) }
}

/** The check of the wake word of NeoAlice, which reads the text of each phrase of the avatar microphone. */
export function useNeoAliceWakeWordDiagnostics() {
  const bridge = useNeoAliceBridgeStore()
  const hearing = useHearingStore()

  const facts = computed<NeoAliceWakeWordFacts>(() => ({
    voiceInput: bridge.voiceInput,
    wakeWord: bridge.wakeWord,
    transcriptionConfigured: Boolean(hearing.activeTranscriptionProvider && hearing.activeTranscriptionModel),
    serverKnown: true,
    connected: bridge.status === 'connected',
    voiceStatus: bridge.voiceStatus,
    voiceError: bridge.voiceError,
  }))
  const findings = computed(() => diagnoseNeoAliceWakeWord(facts.value))
  return { findings, canRun: computed(() => wakeWordCanRun(findings.value)) }
}
