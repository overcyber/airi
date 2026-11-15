import type { HearingInputMode } from '../../stores/modules/hearing'

/** What the app knows now about the wake word of the AIRI detector. */
export interface WakeWordFacts {
  /** At least one pronunciation of the pinned model is active. */
  hasActivePronunciation: boolean
  /** A shared pronunciation has no character that answers it. */
  hasUnresolvedConflict: boolean
  hearingEnabled: boolean
  /** The microphone switch of Hearing is off, so no feature listens. */
  microphoneOff: boolean
  /** The listening preference of the user is on. */
  listeningPreference: boolean
  inputMode: HearingInputMode
  /** The screen allows continuous listening. A phone screen does not, unless the user turns it on. */
  continuousAllowed: boolean
  /** A transcription provider and model are set, for what the user says after the wake word. */
  transcriptionConfigured: boolean
  /** The detector, as the voice host reports it. */
  preparation: 'unconfigured' | 'preparing' | 'ready' | 'error'
  preparationError?: string
}

/** One line of the check. `ok` lines are good news. A `blocked` line stops the wake word. A `warning` line does not. */
export interface WakeWordFinding {
  id: string
  status: 'ok' | 'blocked' | 'warning'
  /** Values for the text of the line. */
  params?: Record<string, string>
}

/**
 * Lists what stands between the user and a working wake word, in the order to fix it.
 *
 * Every wake word problem shows here as a line, so the user does not have to guess. Before this list, a wake word that
 * did not run said nothing.
 */
export function diagnoseWakeWord(facts: WakeWordFacts): WakeWordFinding[] {
  const finding = (id: string, status: WakeWordFinding['status'], params?: Record<string, string>): WakeWordFinding => ({ id, status, params })
  const list: WakeWordFinding[] = [
    facts.hasActivePronunciation ? finding('word', 'ok') : finding('word', 'blocked'),
    facts.hearingEnabled ? finding('hearing', 'ok') : finding('hearing', 'blocked'),
    facts.microphoneOff ? finding('microphone', 'blocked') : finding('microphone', 'ok'),
    !facts.listeningPreference ? finding('listening', 'blocked') : finding('listening', 'ok'),
    facts.inputMode === 'push-to-talk' ? finding('mode', 'blocked') : finding('mode', 'ok'),
    facts.continuousAllowed ? finding('screen', 'ok') : finding('screen', 'blocked'),
    facts.transcriptionConfigured ? finding('transcription', 'ok') : finding('transcription', 'warning'),
  ]
  if (facts.hasUnresolvedConflict)
    list.push(finding('conflict', 'warning'))
  // The detector only matters when nothing before it blocks the wake word.
  if (facts.preparation === 'error')
    list.push(finding('detector', 'blocked', { error: facts.preparationError ?? '' }))
  else if (facts.preparation === 'preparing')
    list.push(finding('detector', 'warning'))
  else if (facts.preparation === 'ready')
    list.push(finding('detector', 'ok'))
  return list
}

/** `true` when no line blocks the wake word. */
export function wakeWordCanRun(findings: readonly WakeWordFinding[]): boolean {
  return findings.every(item => item.status !== 'blocked')
}

/** What the app knows now about the wake word of NeoAlice, which reads the text of each phrase. */
export interface NeoAliceWakeWordFacts {
  /** The switch "microphone of the avatar". */
  voiceInput: boolean
  /** The field of the wake word. Empty means no wake word: every phrase goes to NeoAlice. */
  wakeWord: string
  transcriptionConfigured: boolean
  /** The app has an address to reach the server that transcribes. */
  serverKnown: boolean
  connected: boolean
  voiceStatus: string
  voiceError: string
}

/** The same kind of list for the wake word of NeoAlice. The first line that is blocked is the one to fix. */
export function diagnoseNeoAliceWakeWord(facts: NeoAliceWakeWordFacts): WakeWordFinding[] {
  const finding = (id: string, status: WakeWordFinding['status'], params?: Record<string, string>): WakeWordFinding => ({ id, status, params })
  const list: WakeWordFinding[] = [
    facts.connected ? finding('connected', 'ok') : finding('connected', 'blocked'),
    facts.voiceInput ? finding('voice-input', 'ok') : finding('voice-input', 'blocked'),
    facts.wakeWord.trim() !== '' ? finding('field', 'ok') : finding('field', 'blocked'),
    facts.transcriptionConfigured ? finding('transcription', 'ok') : finding('transcription', 'blocked'),
  ]
  if (facts.voiceStatus === 'error' && facts.voiceError !== '')
    list.push(finding('error', 'blocked', { error: facts.voiceError }))
  return list
}
