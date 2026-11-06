import { describe, expect, it, vi } from 'vitest'

import { fetchServerDefaults, isUnreachableFromPage, requestServerDefaults, resolveServerDefaults } from './server-defaults'

const page = { origin: 'https://192.0.2.10:4443', protocol: 'https:' }

function jsonResponse(body: unknown, contentType = 'application/json') {
  return new Response(JSON.stringify(body), { headers: { 'content-type': contentType } })
}

describe('fetchServerDefaults', () => {
  it('reads the defaults of the server and makes the proxy paths absolute on the page origin', async () => {
    const fetchFile = vi.fn<typeof fetch>(async () => jsonResponse({
      providers: {
        'ollama': { baseUrl: '/proxy/llm/v1/' },
        'openai-compatible-audio-speech': { apiKey: 'local', baseUrl: '/proxy/tts/v1/', model: 'kokoro', voice: 'pf_dora' },
        'nvidia': { apiKey: '', baseUrl: '' },
      },
      modules: {
        speech: { provider: 'openai-compatible-audio-speech', model: 'kokoro', voice: 'pf_dora' },
      },
      neoalice: { site: 'mirror', enabled: true, speechMode: 'neoalice-audio', voiceInput: true, userId: 'user-1', announceState: true },
    }))

    const defaults = await fetchServerDefaults(page, fetchFile)

    expect(fetchFile).toHaveBeenCalledWith('https://192.0.2.10:4443/airi-defaults.json', expect.anything())
    expect(defaults?.providers).toEqual({
      'ollama': { baseUrl: 'https://192.0.2.10:4443/proxy/llm/v1/' },
      'openai-compatible-audio-speech': { apiKey: 'local', baseUrl: 'https://192.0.2.10:4443/proxy/tts/v1/', model: 'kokoro', voice: 'pf_dora' },
    })
    expect(defaults?.modules.speech).toEqual({ provider: 'openai-compatible-audio-speech', model: 'kokoro', voice: 'pf_dora' })
    expect(defaults?.neoalice).toEqual({ site: 'mirror', enabled: true, speechMode: 'neoalice-audio', voiceInput: true, userId: 'user-1', announceState: true, brokerUrl: 'wss://192.0.2.10:4443/mqtt', brainMode: false, moodSite: '' })
  })

  it('returns nothing for the HTML page of a dev server, a failed request, or a page outside HTTP', async () => {
    const html = vi.fn<typeof fetch>(async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }))
    const failing = vi.fn<typeof fetch>(async () => {
      throw new Error('connection refused')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(await fetchServerDefaults(page, html)).toBeUndefined()
    expect(await fetchServerDefaults(page, failing)).toBeUndefined()
    expect(await fetchServerDefaults({ origin: 'file://', protocol: 'file:' }, html)).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})

describe('fetchServerDefaults of the desktop app', () => {
  it('reads the server of VITE_AIRI_SERVER_URL from a file page, and points the bridge at its /mqtt', async () => {
    const fetchFile = vi.fn<typeof fetch>(async () => jsonResponse({
      providers: { ollama: { baseUrl: '/proxy/llm/v1/' } },
      neoalice: { site: 'airi-avatar' },
    }))

    const defaults = await fetchServerDefaults({ origin: 'null', protocol: 'file:' }, fetchFile, 'http://192.0.2.10:4173')

    expect(fetchFile).toHaveBeenCalledWith('http://192.0.2.10:4173/airi-defaults.json', expect.anything())
    expect(defaults?.providers.ollama).toEqual({ baseUrl: 'http://192.0.2.10:4173/proxy/llm/v1/' })
    expect(defaults?.neoalice?.brokerUrl).toBe('ws://192.0.2.10:4173/mqtt')
  })
})

describe('resolveServerDefaults', () => {
  it('keeps an absolute base URL, for example a service on another machine', () => {
    const defaults = resolveServerDefaults({
      providers: { ollama: { baseUrl: 'http://192.0.2.18:11434/v1/' } },
      modules: {},
    }, page.origin)

    expect(defaults.providers.ollama).toEqual({ baseUrl: 'http://192.0.2.18:11434/v1/' })
  })
})

describe('isUnreachableFromPage', () => {
  it('finds the base URLs that an HTTPS page can never call', () => {
    expect(isUnreachableFromPage('http://192.0.2.18:11434/v1/', page)).toBe(true)
    expect(isUnreachableFromPage('https://integrate.api.nvidia.com/v1/', page)).toBe(true)
  })

  it('keeps the proxy, localhost, HTTPS services, and a page on HTTP', () => {
    expect(isUnreachableFromPage('https://192.0.2.10:4443/proxy/llm/v1/', page)).toBe(false)
    expect(isUnreachableFromPage('http://localhost:11434/v1/', page)).toBe(false)
    expect(isUnreachableFromPage('https://llm.example.com/v1/', page)).toBe(false)
    expect(isUnreachableFromPage('http://192.0.2.18:11434/v1/', { protocol: 'http:', origin: 'http://localhost:4173' })).toBe(false)
    expect(isUnreachableFromPage('', page)).toBe(false)
  })
})

describe('requestServerDefaults', () => {
  it('names the cause of each failure', async () => {
    const refused = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch')
    })
    const notFound = vi.fn<typeof fetch>(async () => new Response('', { status: 404 }))
    const html = vi.fn<typeof fetch>(async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }))

    await expect(requestServerDefaults('http://192.0.2.10:4173', refused)).rejects.toThrow('did not answer')
    await expect(requestServerDefaults('http://192.0.2.10:4173', notFound)).rejects.toThrow('answered 404')
    await expect(requestServerDefaults('http://192.0.2.10:4173', html)).rejects.toThrow('did not answer JSON')
  })
})
