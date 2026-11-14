/** Hosts that refuse calls from a browser page (CORS). The server proxy reaches them. */
const browserBlockedHosts = new Set(['integrate.api.nvidia.com'])

/**
 * Tells if a page can never reach a base URL, so the call ends in "Failed to fetch".
 *
 * - An HTTPS page cannot call `http://` on another host (mixed content). `localhost` is an exception.
 * - Some APIs refuse every browser origin (CORS), for example the NVIDIA NIM cloud API.
 *
 * @example
 * isUnreachableFromPage('http://192.0.2.18:11434/v1/', { protocol: 'https:', origin: 'https://192.0.2.10:4443' })
 * // => true
 */
export function isUnreachableFromPage(baseUrl: unknown, page: Pick<Location, 'protocol' | 'origin'>) {
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '')
    return false
  let url: URL
  try {
    url = new URL(baseUrl)
  }
  catch {
    return false
  }
  if (url.origin === page.origin)
    return false
  if (browserBlockedHosts.has(url.hostname))
    return true
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  return page.protocol === 'https:' && url.protocol === 'http:' && !local
}
