import { describe, expect, it } from 'vitest'

import { diagnoseNeoAliceWakeWord, diagnoseWakeWord, wakeWordCanRun } from './wake-word-diagnostics'

const good = {
  hasActivePronunciation: true,
  hasUnresolvedConflict: false,
  hearingEnabled: true,
  microphoneOff: false,
  listeningPreference: true,
  inputMode: 'always-on' as const,
  continuousAllowed: true,
  transcriptionConfigured: true,
  preparation: 'ready' as const,
}

const statusOf = (facts: Parameters<typeof diagnoseWakeWord>[0], id: string) => diagnoseWakeWord(facts).find(item => item.id === id)?.status

describe('diagnoseWakeWord', () => {
  it('says that everything is fine when it is', () => {
    const findings = diagnoseWakeWord(good)
    expect(findings.every(item => item.status === 'ok')).toBe(true)
    expect(wakeWordCanRun(findings)).toBe(true)
  })

  it('blocks when there is no wake word, the common case of a new character', () => {
    const findings = diagnoseWakeWord({ ...good, hasActivePronunciation: false, preparation: 'unconfigured' })
    expect(findings[0]).toEqual({ id: 'word', status: 'blocked', params: undefined })
    expect(wakeWordCanRun(findings)).toBe(false)
  })

  it('blocks on a phone screen that does not listen continuously, and on push to talk', () => {
    expect(statusOf({ ...good, continuousAllowed: false }, 'screen')).toBe('blocked')
    expect(statusOf({ ...good, inputMode: 'push-to-talk' }, 'mode')).toBe('blocked')
    expect(statusOf({ ...good, inputMode: 'wake-word' }, 'mode')).toBe('ok')
  })

  it('blocks when Hearing or the microphone is off, and when the listening preference is off', () => {
    expect(statusOf({ ...good, hearingEnabled: false }, 'hearing')).toBe('blocked')
    expect(statusOf({ ...good, microphoneOff: true }, 'microphone')).toBe('blocked')
    expect(statusOf({ ...good, listeningPreference: false }, 'listening')).toBe('blocked')
  })

  it('only warns about a missing transcription provider and an unresolved shared pronunciation', () => {
    const findings = diagnoseWakeWord({ ...good, transcriptionConfigured: false, hasUnresolvedConflict: true })
    expect(findings.find(item => item.id === 'transcription')?.status).toBe('warning')
    expect(findings.find(item => item.id === 'conflict')?.status).toBe('warning')
    expect(wakeWordCanRun(findings)).toBe(true)
  })

  it('reports the failure of the detector with its error', () => {
    const findings = diagnoseWakeWord({ ...good, preparation: 'error', preparationError: 'model missing' })
    expect(findings.find(item => item.id === 'detector')).toEqual({ id: 'detector', status: 'blocked', params: { error: 'model missing' } })
    expect(diagnoseWakeWord({ ...good, preparation: 'preparing' }).find(item => item.id === 'detector')?.status).toBe('warning')
  })
})

describe('diagnoseNeoAliceWakeWord', () => {
  const neo = { voiceInput: true, wakeWord: 'Eva, Ewa', transcriptionConfigured: true, serverKnown: true, connected: true, voiceStatus: 'listening', voiceError: '' }

  it('passes when the microphone, the field, and the transcription are set', () => {
    expect(diagnoseNeoAliceWakeWord(neo).every(item => item.status === 'ok')).toBe(true)
  })

  it('blocks on each missing piece, in the order to fix', () => {
    expect(diagnoseNeoAliceWakeWord({ ...neo, connected: false })[0]).toMatchObject({ id: 'connected', status: 'blocked' })
    expect(diagnoseNeoAliceWakeWord({ ...neo, voiceInput: false }).find(item => item.id === 'voice-input')?.status).toBe('blocked')
    expect(diagnoseNeoAliceWakeWord({ ...neo, wakeWord: '  ' }).find(item => item.id === 'field')?.status).toBe('blocked')
    expect(diagnoseNeoAliceWakeWord({ ...neo, transcriptionConfigured: false }).find(item => item.id === 'transcription')?.status).toBe('blocked')
  })

  it('shows the error that the microphone reported', () => {
    const list = diagnoseNeoAliceWakeWord({ ...neo, voiceStatus: 'error', voiceError: 'denied' })
    expect(list.at(-1)).toEqual({ id: 'error', status: 'blocked', params: { error: 'denied' } })
  })
})
