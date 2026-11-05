import { errorMessageFrom } from '@moeru/std'

import * as v from 'valibot'

import { useConsciousnessStore } from './modules/consciousness'
import { useHearingStore } from './modules/hearing'
import { useNeoAliceBridgeStore } from './modules/neoalice-bridge'
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
  })),
})

export type ServerDefaults = v.InferOutput<typeof ServerDefaultsSchema>

/**
 * Settings that the server of the page offers as defaults, at `/airi-defaults.json`.
 *
 * The Alice deployment (`deploy/alice`) writes this file from its `.env`: the proxies of the local
 * LLM, TTS, and STT, the model names, and the NeoAlice site. Paths become absolute URLs on the
 * origin of the page. Empty values are removed, so a provider without a base URL is left out.
 *
 * Returns undefined when the page is not served over HTTP, or the server has no such file.
 */
export async function fetchServerDefaults(
  page: Pick<Location, 'origin' | 'protocol'> | undefined = globalThis.location,
  fetchFile: typeof fetch = globalThis.fetch,
): Promise<ServerDefaults | undefined> {
  if (!page || !/^https?:$/.test(page.protocol) || typeof fetchFile !== 'function')
    return undefined
  try {
    const response = await fetchFile(new URL('/airi-defaults.json', page.origin).href, { headers: { Accept: 'application/json' } })
    if (!response.ok || !response.headers.get('content-type')?.includes('json'))
      return undefined
    const parsed = v.safeParse(ServerDefaultsSchema, await response.json())
    if (!parsed.success)
      return undefined
    return resolveServerDefaults(parsed.output, page.origin)
  }
  catch (error) {
    console.warn('[server-defaults] the server defaults did not load:', errorMessageFrom(error) ?? error)
    return undefined
  }
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
  return { ...defaults, providers }
}

/**
 * Applies the server defaults where this browser has no setting of its own.
 *
 * - A provider gets the server configuration only when it has no stored configuration.
 *   After a valid check, the provider is added, so the module selectors list it.
 * - A module gets the server selection only when it has no provider selected.
 * - The NeoAlice bridge gets the server site, speech mode, microphone, and user ID only when it has no site.
 *
 * So the server sets the first state, and every setting stays editable in the app.
 */
export async function applyServerDefaults(defaults: ServerDefaults | undefined) {
  if (!defaults)
    return

  const providerStore = useProviderStore()
  const providerConfigStore = useProviderConfigStore()
  const valid = new Set<string>()

  for (const [providerId, config] of Object.entries(defaults.providers)) {
    if (!providerStore.findProviderDefinition(providerId))
      continue
    if (!providerConfigStore.getProvider(providerId)) {
      providerConfigStore.ensureProvider(providerId, providerId, { ...providerStore.getDefaultProviderConfig(providerId), ...config })
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
  if (consciousness?.provider && valid.has(consciousness.provider) && !consciousnessStore.activeProvider) {
    consciousnessStore.activeProvider = consciousness.provider
    consciousnessStore.activeModel = consciousness.model
  }

  const speechStore = useSpeechStore()
  if (speech?.provider && valid.has(speech.provider) && (!speechStore.activeSpeechProvider || speechStore.activeSpeechProvider === 'speech-noop'))
    await speechStore.selectProviderModel(speech.provider, speech.model, speech.voice || undefined)

  const hearingStore = useHearingStore()
  if (hearing?.provider && valid.has(hearing.provider) && !hearingStore.activeTranscriptionProvider) {
    hearingStore.activeTranscriptionProvider = hearing.provider
    hearingStore.activeTranscriptionModel = hearing.model
  }

  const bridge = useNeoAliceBridgeStore()
  if (defaults.neoalice?.site && !bridge.site) {
    bridge.site = defaults.neoalice.site
    bridge.enabled = defaults.neoalice.enabled
    bridge.speechMode = defaults.neoalice.speechMode
    bridge.voiceInput = defaults.neoalice.voiceInput
    bridge.userId = defaults.neoalice.userId
  }
}
