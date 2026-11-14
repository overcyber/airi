import type { CustomMotion } from '@proj-airi/alice-motion'
import type { VrmEmoteAnimation, VrmMotionLibrary } from '@proj-airi/stage-ui-three/assets/vrm'

import type { VrmMotionRecord } from '../database/repos/vrm-motions.repo'

import { errorMessageFrom } from '@moeru/std'
import { defaultVrmMotionLibrary } from '@proj-airi/stage-ui-three/assets/vrm'
import { createEventHook } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import * as v from 'valibot'

import { vrmMotionPrefix, vrmMotionsRepo } from '../database/repos/vrm-motions.repo'
import { isUnreachableFromPage } from '../libs/page-reach'
import { useNeoAliceBrainStore } from './modules/neoalice-brain'

/** Name and description of an imported motion. The LLM reads the description to choose it. */
export interface VrmMotionDetails {
  name: string
  description: string
}

const motionFile = /\.(vrma|fbx)$/i

/** The file name without the `.vrma` or `.fbx` extension. */
function nameFromFile(file: File) {
  return file.name.replace(motionFile, '').trim() || 'Motion'
}

const ServerMotionListSchema = v.array(v.object({ name: v.string(), type: v.string() }))

/**
 * Motions that an Alice server lists at `/animations/`: the FBX and VRMA files of `deploy/alice/animacoes`.
 *
 * The list is the JSON autoindex of Nginx. Each file becomes an emote with a URL. Its name comes from the
 * file name, for example `Wave_Hello.fbx` becomes "Wave Hello", so NeoAlice can ask for it by name.
 * Returns an empty list when there is no server, or it has no such list.
 */
export async function fetchServerMotions(origin: string | undefined, fetchList: typeof fetch = globalThis.fetch): Promise<VrmEmoteAnimation[]> {
  if (!origin || typeof fetchList !== 'function')
    return []
  try {
    const response = await fetchList(new URL('/animations/', origin).href, { headers: { Accept: 'application/json' } })
    if (!response.ok || !response.headers.get('content-type')?.includes('json'))
      return []
    const parsed = v.safeParse(ServerMotionListSchema, await response.json())
    if (!parsed.success)
      return []
    return parsed.output
      .filter(entry => entry.type === 'file' && motionFile.test(entry.name))
      .map((entry) => {
        const name = entry.name.replace(motionFile, '').replace(/[_-]+/g, ' ').trim()
        return {
          id: `server-motion-${entry.name}`,
          name,
          description: name,
          url: new URL(`/animations/${encodeURIComponent(entry.name)}`, origin).href,
          format: /\.fbx$/i.test(entry.name) ? 'fbx' as const : 'vrma' as const,
        }
      })
  }
  catch (error) {
    console.warn('[vrm-motions] the server motion list did not load:', errorMessageFrom(error) ?? error)
    return []
  }
}

/**
 * Origin of the Alice server: the saved server URL, or the page when it is served over HTTP. `undefined` without one.
 *
 * A saved URL that the page cannot call gives the page. For example, the web app on `https://192.0.2.10` with the
 * saved `http://192.0.2.10:4173`: the browser blocks the `http://` files (mixed content), and the page is the server.
 */
export function aliceServerOrigin(page: Pick<Location, 'origin' | 'protocol'> | undefined = globalThis.location) {
  const pageOrigin = page && /^https?:$/.test(page.protocol) ? page.origin : undefined
  const saved = useNeoAliceBrainStore().serverUrl.trim()
  if (!saved)
    return pageOrigin
  if (page && pageOrigin && isUnreachableFromPage(saved, page))
    return pageOrigin
  try {
    return new URL(saved).origin
  }
  catch {
    return undefined
  }
}

/**
 * VRM motion library of the stage: the bundled Utsuwa motions plus the VRMA files that the user imported.
 *
 * Use it for the `motionLibrary` of the VRM stage and for the motion list of the VRM settings.
 * Imported files stay on this device (IndexedDB through localforage).
 */
export const useVrmMotionsStore = defineStore('vrm-motions', () => {
  const imported = shallowRef<VrmMotionRecord[]>([])
  /** Motions of the Alice server (`/animations/`). They are not stored on this device. */
  const serverEmotes = shallowRef<VrmEmoteAnimation[]>([])
  const loaded = ref(false)
  let loading: Promise<void> | undefined
  /** One object URL per imported file, revoked when the motion is removed. */
  const objectUrls = new Map<string, string>()
  const playRequest = createEventHook<string>()
  // The desktop app shows the settings in another window than the stage. A Play button there reaches the stage
  // through this channel. The web settings page plays on its own preview, through the local hook.
  const playChannel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('airi-stores-vrm-motions-play')
  playChannel?.addEventListener('message', (event: MessageEvent<{ type?: string, id?: unknown }>) => {
    if (event.data?.type === 'vrm-motion-play' && typeof event.data.id === 'string')
      void playRequest.trigger(event.data.id)
  })

  function urlOf(record: VrmMotionRecord) {
    let url = objectUrls.get(record.id)
    if (!url) {
      url = URL.createObjectURL(record.file)
      objectUrls.set(record.id, url)
    }
    return url
  }

  const importedEmotes = computed<VrmEmoteAnimation[]>(() => imported.value.map(record => ({
    id: record.id,
    name: record.name,
    description: record.description,
    url: urlOf(record),
    format: record.format ?? 'vrma',
  })))

  const motionLibrary = computed<VrmMotionLibrary>(() => ({
    ...defaultVrmMotionLibrary,
    // The talking animations of the TalkingHead server take turns while she speaks (Plan 08, M1).
    talkingPool: serverEmotes.value.filter(emote => /^talking\s*\d+$/i.test(emote.name)).map(emote => emote.url),
    emotes: [...defaultVrmMotionLibrary.emotes, ...serverEmotes.value, ...importedEmotes.value],
  }))

  /** Reads the imported motions once. Later calls wait for the same read. */
  function load() {
    loading ??= Promise.all([
      vrmMotionsRepo.list(),
      fetchServerMotions(aliceServerOrigin()),
    ]).then(([records, server]) => {
      imported.value = records
      serverEmotes.value = server
      loaded.value = true
    })
    return loading
  }

  /**
   * Stores a VRMA or FBX file as a new emote. An FBX is a Mixamo or Ready Player Me animation (V5).
   *
   * Before: a `.vrma` or `.fbx` file and an optional name and description.
   * After: the emote is in `motionLibrary`, and the LLM prompt lists it.
   */
  async function importMotion(file: File, details: Partial<VrmMotionDetails> = {}) {
    const extension = motionFile.exec(file.name)?.[1].toLowerCase()
    if (!extension)
      throw new Error(`Not a VRMA or FBX file: ${file.name}`)
    await load()
    const name = details.name?.trim() || nameFromFile(file)
    const record: VrmMotionRecord = {
      id: `${vrmMotionPrefix}${nanoid()}`,
      name,
      description: details.description?.trim() || name,
      file,
      importedAt: Date.now(),
      format: extension === 'fbx' ? 'fbx' : 'vrma',
    }
    await vrmMotionsRepo.save(record)
    imported.value = [...imported.value, record]
    return record
  }

  async function updateMotion(id: string, details: VrmMotionDetails) {
    const record = imported.value.find(entry => entry.id === id)
    if (!record)
      return
    const name = details.name.trim() || record.name
    const updated: VrmMotionRecord = { ...record, name, description: details.description.trim() || name }
    await vrmMotionsRepo.save(updated)
    imported.value = imported.value.map(entry => entry.id === id ? updated : entry)
  }

  async function removeMotion(id: string) {
    await vrmMotionsRepo.remove(id)
    imported.value = imported.value.filter(entry => entry.id !== id)
    const url = objectUrls.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      objectUrls.delete(id)
    }
  }

  /**
   * Motions that NeoAlice or an LLM created and named, by name: the saved library of the companion service
   * (`evt/avatar/motions`) plus the ones defined since. The motions page lists them.
   */
  const customMotions = shallowRef<CustomMotion[]>([])

  function setCustomMotions(motions: readonly CustomMotion[]) {
    customMotions.value = [...motions]
  }

  function rememberCustomMotion(motion: CustomMotion) {
    if (!motion.name)
      return
    customMotions.value = [...customMotions.value.filter(item => item.name !== motion.name), motion]
  }

  /** Asks the VRM stage to play an emote, for example the preview button of the settings. */
  function requestPlay(id: string) {
    void playRequest.trigger(id)
    playChannel?.postMessage({ type: 'vrm-motion-play', id })
  }

  return {
    imported,
    serverEmotes,
    loaded,
    motionLibrary,
    load,
    importMotion,
    updateMotion,
    removeMotion,
    requestPlay,
    onPlayRequest: playRequest.on,
    customMotions,
    setCustomMotions,
    rememberCustomMotion,
  }
})
