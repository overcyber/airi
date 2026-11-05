import { describe, expect, it, vi } from 'vitest'

import { DisplayModelFormat, fetchServerDisplayModels } from './display-models'

const page = { origin: 'https://192.0.2.10:4443', protocol: 'https:' }

function jsonResponse(body: unknown, contentType = 'application/json') {
  return new Response(JSON.stringify(body), { headers: { 'content-type': contentType } })
}

describe('fetchServerDisplayModels', () => {
  it('lists each VRM file of the Nginx JSON autoindex as a URL model', async () => {
    const fetchList = vi.fn(async () => jsonResponse([
      { name: 'eva2.vrm', type: 'file', mtime: 'Thu, 05 Nov 2026 12:00:00 GMT', size: 14386108 },
      { name: 'notes.txt', type: 'file', mtime: 'Thu, 05 Nov 2026 12:00:00 GMT', size: 10 },
      { name: 'old', type: 'directory', mtime: 'Thu, 05 Nov 2026 12:00:00 GMT' },
    ]))

    const models = await fetchServerDisplayModels(page, fetchList as unknown as typeof fetch)

    expect(fetchList).toHaveBeenCalledWith('https://192.0.2.10:4443/models/', expect.anything())
    expect(models).toEqual([{
      id: 'server-vrm-eva2.vrm',
      format: DisplayModelFormat.VRM,
      type: 'url',
      url: 'https://192.0.2.10:4443/models/eva2.vrm',
      name: 'eva2',
      importedAt: Date.parse('Thu, 05 Nov 2026 12:00:00 GMT'),
    }])
  })

  it('returns no model for the HTML page of a dev server, a failed request, or a page outside HTTP', async () => {
    const html = vi.fn(async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }))
    const failing = vi.fn(async () => {
      throw new Error('connection refused')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(await fetchServerDisplayModels(page, html as unknown as typeof fetch)).toEqual([])
    expect(await fetchServerDisplayModels(page, failing as unknown as typeof fetch)).toEqual([])
    expect(await fetchServerDisplayModels({ origin: 'null', protocol: 'file:' }, failing as unknown as typeof fetch)).toEqual([])
    expect(await fetchServerDisplayModels(undefined, failing as unknown as typeof fetch)).toEqual([])
    expect(failing).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
