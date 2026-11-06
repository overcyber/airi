import { errorMessageFrom } from '@moeru/std'

import * as v from 'valibot'

import { useConsciousnessStore } from './modules/consciousness'
import { useHearingStore } from './modules/hearing'
import { useNeoAliceBrainStore } from './modules/neoalice-brain'
import { defaultNeoAliceBrokerUrl, useNeoAliceBridgeStore } from './modules/neoalice-bridge'
import { useSpeechStore } from './modules/speech'
import { useProviderConfigStore } from './providers/config'
import { useProviderStore } from './providers/provider'

const ProviderDefaultsSchema = v.record(v.string(), v.record(v.string(), v.string()))

const ModuleSelectionSchema = v.object({
  provider: v.optional(v.string(), ''),
  model: v.optional(v.string(), ''),
  voice: v.optional(v.string(), ''),
})

const ServerDefaultsSchema = v.object({
  providers: v.optional(ProviderDefaultsSchema, {}),
  modules: v.optional(v.object({
    consciousness: v.optional(ModuleSelectionSchema),
    speech: v.optional(ModuleSelectionSchema),
    hearing: v.optional(ModuleSelectionSchema),
  }), {}),
  neoalice: v.optional(v.object({
    site: v.optional(v.string(), ''),
    enabled: v.optional(v.boolean(), false),
    speechMode: v.optional(v.picklist(['silent', 'neoalice-audio', 'airi-voice']), 'silent'),
    voiceInput: v.optional(v.boolean(), false),
    userId: v.optional(v.string(), ''),
    announceState: v.optional(v.boolean(), false),
    /** WebSocket URL of the broker. Empty: the `/mqtt` path of the server. */
    brokerUrl: v.optional(v.string(), ''),
    /** NeoAlice answers the chat. See `useNeoAliceBrainStore`. */
    brainMode: v.optional(v.boolean(), false),
  })),
})

export type ServerDefaults = v.InferOutput<typeof ServerDefaultsSchema>

/**
 * Settings that an Alice server offers as defaults, at `/airi-defaults.json`.
 *
 * The Alice deployment (`deploy/alice`) writes this file from its `.env`: the proxies of the local
 * LLM, TTS, and STT, the model names, and the NeoAlice site. Paths become absolute URLs on the
 * origin of the server. Empty values are removed, so a provider without a base URL is left out.
 *
 * The server is the server of the page (web app), or `serverOrigin` (desktop app, from
 * `VITE_AIRI_SERVER_URL`). Returns undefined when there is no server, or it has no such file.
 */
export async function fetchServerDefaults(
  page: Pick<Location, 'origin' | 'protocol'> | undefined = globalThis.location,
  fetchFile: typeof fetch = globalThis.fetch,
  serverOrigin?: string,
): Promise<ServerDefaults | undefined> {
  const origin = serverOrigin ?? (page && /^https?:$/.test(page.protocol) ? page.origin : undefined)
  if (!origin || typeof fetchFile !== 'function')
    return undefined
  try {
    return await requestServerDefaults(origin, fetchFile)
  }
  catch (error) {
    console.warn('[server-defaults] the server defaults did not load:', errorMessageFrom(error) ?? error)
    return undefined
  }
}

/**
 * Reads `/airi-defaults.json` of `origin`. It throws an error that names the cause, for the
 * "Load settings from the server" action: no connection, an HTTP status, or a server without the file.
 */
export async function requestServerDefaults(origin: string, fetchFile: typeof fetch = globalThis.fetch): Promise<ServerDefaults> {
  const url = new URL('/airi-defaults.json', origin).href
  let response: Response
  try {
    response = await fetchFile(url, { headers: { Accept: 'application/json' } })
  }
  catch {
    // The browser gives no detail for a refused connection, a certificate it does not trust, or CORS.
    throw new Error(`${url} did not answer. Check that airi-web runs and the address is right. The desktop app needs the HTTP port (4173), because it does not trust the local certificate, and AIRI_CORS_ORIGINS=null on the server.`)
  }
  if (!response.ok)
    throw new Error(`${url} answered ${response.status}. Rebuild and restart airi-web: docker compose -f deploy/alice/compose.yaml up -d --build`)
  if (!response.headers.get('content-type')?.includes('json'))
    throw new Error(`${url} did not answer JSON. The server is not an Alice server, or its airi-web image is older than the server defaults. Rebuild it.`)
  const parsed = v.safeParse(ServerDefaultsSchema, await response.json())
  if (!parsed.success)
    throw new Error(`${url} has settings that this app cannot read. Use the same version of the app and of airi-web.`)
  return resolveServerDefaults(parsed.output, origin)
}

/**
 * Loads the settings of the Alice server and applies them.
 *
 * The server is the saved server URL, or the server of the page. With `overwrite`, the server
 * settings replace the saved ones: that is the "Load settings from the server" action.
 * Resolves `false` when there is no server, or it has no settings.
 */
export async function loadServerDefaults(options: { overwrite?: boolean } = {}) {
  let saved = useNeoAliceBrainStore().serverUrl.trim()
  // An HTTPS page cannot call http:// (mixed content). On the web app the page is the server, so use it.
  if (saved && globalThis.location && isUnreachableFromPage(saved, globalThis.location))
    saved = ''
  let serverOrigin: string | undefined
  if (saved) {
    try {
      serverOrigin = new URL(saved).origin
    }
    catch {
      throw new Error(`The Alice server URL is not a URL: ${saved}`)
    }
  }
  if (options.overwrite) {
    // The explicit action reports the cause of a failure.
    const page = globalThis.location
    const origin = serverOrigin ?? (page && /^https?:$/.test(page.protocol) ? page.origin : undefined)
    if (!origin)
      throw new Error('Set the Alice server URL, for example http://192.0.2.10:4173.')
    await applyServerDefaults(await requestServerDefaults(origin), page, options)
    return true
  }
  const defaults = await fetchServerDefaults(globalThis.location, globalThis.fetch, serverOrigin)
  if (!defaults)
    return false
  await applyServerDefaults(defaults, globalThis.location, options)
  return true
}

/** Removes empty values, and makes each path in a `baseUrl` an absolute URL on `origin`. */
export function resolveServerDefaults(defaults: ServerDefaults, origin: string): ServerDefaults {
  const providers: Record<string, Record<string, string>> = {}
  for (const [providerId, config] of Object.entries(defaults.providers)) {
    const entries = Object.entries(config).filter(([, value]) => value.trim() !== '')
    const resolved = Object.fromEntries(entries.map(([key, value]) =>
      [key, key === 'baseUrl' ? new URL(value, origin).href : value]))
    if (resolved.baseUrl)
      providers[providerId] = resolved
  }
  const neoalice = defaults.neoalice && {
    ...defaults.neoalice,
    brokerUrl: defaults.neoalice.brokerUrl || defaultNeoAliceBrokerUrl(new URL(origin)),
  }
  return { ...defaults, providers, neoalice }
}

/**
 * A copy of a provider configuration as plain data. A saved configuration holds reactive proxies,
 * and the synced store sends it to other windows through BroadcastChannel, which cannot clone a proxy.
 */
function plainConfig(config: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>
}

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

/**
 * Applies the server defaults where this browser has no setting of its own.
 *
 * - A provider gets the server configuration only when it has no stored configuration.
 *   A stored base URL that this page can never reach gets the server base URL. The other
 *   stored fields, for example the API key, stay.
 *   After a valid check, the provider is added, so the module selectors list it.
 * - A module gets the server selection only when it has no provider selected.
 * - The NeoAlice bridge gets the server site, speech mode, microphone, and user ID only when it has no site.
 *
 * So the server sets the first state, and every setting stays editable in the app.
 */
export async function applyServerDefaults(
  defaults: ServerDefaults | undefined,
  page: Pick<Location, 'protocol' | 'origin'> = globalThis.location,
  options: { overwrite?: boolean } = {},
) {
  if (!defaults)
    return
  // `overwrite` is the explicit "Load settings from the server" action: the server settings replace
  // the saved ones. A saved API key stays when the server has none.
  const overwrite = options.overwrite === true

  const providerStore = useProviderStore()
  const providerConfigStore = useProviderConfigStore()
  const valid = new Set<string>()

  for (const [providerId, config] of Object.entries(defaults.providers)) {
    if (!providerStore.findProviderDefinition(providerId))
      continue
    const stored = providerConfigStore.getProvider(providerId)
    if (!stored) {
      providerConfigStore.ensureProvider(providerId, providerId, plainConfig({ ...providerStore.getDefaultProviderConfig(providerId), ...config }))
    }
    else if (overwrite) {
      await providerConfigStore.updateProviderConfig(providerId, plainConfig({ ...stored.config, ...config }), 'unconfigured')
    }
    else if (config.baseUrl && isUnreachableFromPage(stored.config.baseUrl, page)) {
      console.info(`[server-defaults] ${providerId}: ${String(stored.config.baseUrl)} is not reachable from this page. It becomes ${config.baseUrl}.`)
      await providerConfigStore.updateProviderConfig(providerId, plainConfig({ ...stored.config, baseUrl: config.baseUrl }), 'unconfigured')
    }
    try {
      if (await providerStore.validateProvider(providerId)) {
        providerConfigStore.markProviderAdded(providerId)
        valid.add(providerId)
      }
    }
    catch (error) {
      console.warn(`[server-defaults] the check of ${providerId} failed:`, errorMessageFrom(error) ?? error)
    }
  }

  const { consciousness, speech, hearing } = defaults.modules
  const consciousnessStore = useConsciousnessStore()
  if (consciousness?.provider && valid.has(consciousness.provider) && (overwrite || !consciousnessStore.activeProvider)) {
    consciousnessStore.activeProvider = consciousness.provider
    consciousnessStore.activeModel = consciousness.model
  }

  const speechStore = useSpeechStore()
  if (speech?.provider && valid.has(speech.provider) && (overwrite || !speechStore.activeSpeechProvider || speechStore.activeSpeechProvider === 'speech-noop'))
    await speechStore.selectProviderModel(speech.provider, speech.model, speech.voice || undefined)

  const hearingStore = useHearingStore()
  if (hearing?.provider && valid.has(hearing.provider) && (overwrite || !hearingStore.activeTranscriptionProvider)) {
    hearingStore.activeTranscriptionProvider = hearing.provider
    hearingStore.activeTranscriptionModel = hearing.model
  }

  const bridge = useNeoAliceBridgeStore()
  if (defaults.neoalice?.site && (overwrite || !bridge.site)) {
    bridge.site = defaults.neoalice.site
    bridge.enabled = defaults.neoalice.enabled
    bridge.speechMode = defaults.neoalice.speechMode
    bridge.voiceInput = defaults.neoalice.voiceInput
    bridge.userId = defaults.neoalice.userId
    bridge.announceState = defaults.neoalice.announceState
    if (defaults.neoalice.brokerUrl)
      bridge.brokerUrl = defaults.neoalice.brokerUrl
    useNeoAliceBrainStore().brainMode = defaults.neoalice.brainMode
  }
}
