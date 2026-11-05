import { describe, expect, it } from 'vitest'

import { isPublishableSite, neoAliceAudioEvent, neoAliceStateEvent } from './neoalice-satellite'

describe('neoAliceAudioEvent', () => {
  it('builds the canonical v1 evt/audio message of a satellite', () => {
    const message = neoAliceAudioEvent({ site: 'airi-avatar', userId: ' 550e8400-e29b-41d4-a716-446655440000 ', sessionId: 's1', wavBase64: 'UklGRg==', sampleRateHz: 16000, nowMs: Date.UTC(2026, 10, 5, 12) })

    expect(message.topic).toBe('neoalice/v1/airi-avatar/evt/audio')
    expect(message.qos).toBe(1)
    expect(JSON.parse(message.payload)).toEqual({
      v: 1,
      type: 'evt.audio',
      ts: '2026-11-05T12:00:00.000Z',
      site_id: 'airi-avatar',
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      session_id: 's1',
      audio: { format: 'wav', sample_rate_hz: 16000, channels: 1, b64: 'UklGRg==' },
    })
  })

  it('leaves out an empty user, so NeoAlice uses its default user', () => {
    const message = neoAliceAudioEvent({ site: 'airi-avatar', userId: '', sessionId: 's1', wavBase64: 'A', sampleRateHz: 16000, nowMs: 0 })
    expect(JSON.parse(message.payload)).not.toHaveProperty('user_id')
  })
})

describe('neoAliceStateEvent', () => {
  it('builds the evt/state heartbeat of the mirror format', () => {
    const message = neoAliceStateEvent({ site: 'airi-avatar', state: 'idle', detail: 'hb', nowMs: 0 })

    expect(message).toMatchObject({ topic: 'neoalice/v1/airi-avatar/evt/state', qos: 0 })
    expect(JSON.parse(message.payload)).toEqual({ v: 1, type: 'evt.state', ts: '1970-01-01T00:00:00.000Z', site_id: 'airi-avatar', session_id: null, state: { value: 'idle', detail: 'hb' } })
  })
})

describe('isPublishableSite', () => {
  it('refuses empty names and MQTT wildcards', () => {
    expect(isPublishableSite('airi-avatar')).toBe(true)
    expect(isPublishableSite('')).toBe(false)
    expect(isPublishableSite('+')).toBe(false)
    expect(isPublishableSite('a/b')).toBe(false)
  })
})
