import { describe, expect, it, vi } from 'vitest'

import { segmentToWavBase64, sendNeoAliceAudio } from './neoalice-voice'

describe('sendNeoAliceAudio', () => {
  it('posts the phrase to the /audio route and reads the text and the spoken reply', async () => {
    const fetchApi = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ text: 'Luz da sala ligada.', intent: 'light.on', audio_base64: 'UklGRg==' }), {
      headers: { 'content-type': 'application/json' },
    }))

    const reply = await sendNeoAliceAudio({
      apiBaseUrl: 'https://192.0.2.10:4443/proxy/neoalice/',
      userId: 'user-1',
      sessionId: 'session-1',
      audioBase64: 'AAAA',
      returnAudio: true,
    }, fetchApi)

    expect(reply).toEqual({ text: 'Luz da sala ligada.', intent: 'light.on', audioBase64: 'UklGRg==' })
    const [url, init] = fetchApi.mock.calls[0]
    expect(url).toBe('https://192.0.2.10:4443/proxy/neoalice/audio')
    expect(JSON.parse(String(init?.body))).toEqual({ user_id: 'user-1', session_id: 'session-1', audio_base64: 'AAAA', return_audio: true })
  })

  it('reports an HTTP error, for example a refused API key', async () => {
    const fetchApi = vi.fn<typeof fetch>(async () => new Response('{}', { status: 401, statusText: 'Unauthorized' }))

    await expect(sendNeoAliceAudio({
      apiBaseUrl: 'https://192.0.2.10:4443/proxy/neoalice/',
      userId: 'user-1',
      sessionId: 'session-1',
      audioBase64: 'AAAA',
      returnAudio: false,
    }, fetchApi)).rejects.toThrow('NeoAlice answered 401 Unauthorized')
  })
})

describe('segmentToWavBase64', () => {
  it('encodes the samples as a 16 bit mono WAV file', () => {
    const base64 = segmentToWavBase64({ samples: new Float32Array(160), sampleRate: 16000, durationMs: 10 })
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0))

    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('RIFF')
    expect(bytes.length).toBe(44 + 160 * 2)
  })
})
