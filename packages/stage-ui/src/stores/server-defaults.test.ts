import { describe, expect, it, vi } from 'vitest'

import { fetchServerDefaults, isUnreachableFromPage, resolveServerDefaults } from './server-defaults'

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
      neoalice: { site: 'mirror', enabled: true, speechMode: 'neoalice-audio', voiceInput: true, userId: 'user-1' },
    }))

    const defaults = await fetchServerDefaults(page, fetchFile)

    expect(fetchFile).toHaveBeenCalledWith('https://192.0.2.10:4443/airi-defaults.json', expect.anything())
    expect(defaults?.providers).toEqual({
      'ollama': { baseUrl: 'https://192.0.2.10:4443/proxy/llm/v1/' },
      'openai-compatible-audio-speech': { apiKey: 'local', baseUrl: 'https://192.0.2.10:4443/proxy/tts/v1/', model: 'kokoro', voice: 'pf_dora' },
    })
    expect(defaults?.modules.speech).toEqual({ provider: 'openai-compatible-audio-speech', model: 'kokoro', voice: 'pf_dora' })
    expect(defaults?.neoalice).toEqual({ site: 'mirror', enabled: true, speechMode: 'neoalice-audio', voiceInput: true, userId: 'user-1' })
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
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
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
