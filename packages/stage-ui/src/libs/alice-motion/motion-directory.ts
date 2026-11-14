import type { CustomMotion } from '@proj-airi/alice-motion'
import type { VrmEmoteAnimation } from '@proj-airi/stage-ui-three/assets/vrm'

import { avatarRigData, defaultMotionCatalogEntries } from '@proj-airi/alice-motion'

/** One motion of the directory page, with the MQTT command that plays it. */
export interface MotionDirectoryEntry {
  name: string
  group: 'pose' | 'gesto' | 'animacao' | 'criado'
  /** Where the motion comes from, in Portuguese. */
  origin: string
  description: string
  /** The action after `neoalice/v1/<site>/`, for example `cmd/avatar/pose`. */
  action: string
  payload: Record<string, unknown>
}

/**
 * Every motion that the avatar can play, old and new: the poses and gestures of the catalog, the animation files of
 * the motion library, and the motions that NeoAlice or an LLM created and saved.
 *
 * Before: the emotes of the motion library and the saved motions. After: entries sorted by group and name.
 */
export function motionDirectory(emotes: readonly VrmEmoteAnimation[], customMotions: readonly CustomMotion[]): MotionDirectoryEntry[] {
  const entries: MotionDirectoryEntry[] = []
  for (const entry of defaultMotionCatalogEntries) {
    const pose = /^pose_([a-z_]+)$/.exec(entry.semanticAction)
    const gesture = /^gesture_([a-z_]+)$/.exec(entry.semanticAction)
    if (pose && pose[1] !== 'lie_down')
      entries.push({ name: pose[1], group: 'pose', origin: 'catálogo', description: entry.description, action: 'cmd/avatar/pose', payload: { pose: pose[1], duration: 10 } })
    else if (gesture && !gesture[1].endsWith('_mirror'))
      entries.push({ name: gesture[1], group: 'gesto', origin: 'catálogo', description: entry.description, action: 'cmd/avatar/gesture', payload: { gesture: gesture[1], duration: 3 } })
  }
  for (const emote of emotes) {
    if (emote.pose)
      continue
    const local = /^(?:blob:|data:)/.test(emote.url)
    entries.push({
      name: emote.name,
      group: 'animacao',
      origin: local ? 'importado neste aparelho' : emote.url.includes('/animations/') ? 'servidor' : 'biblioteca do AIRI',
      description: emote.description,
      action: 'cmd/avatar/animation',
      payload: { name: emote.name, duration: 6 },
    })
  }
  for (const motion of customMotions) {
    if (!motion.name)
      continue
    entries.push({
      name: motion.name,
      group: 'criado',
      origin: `criado (${motion.format === 'talkinghead' ? 'template TalkingHead' : 'ossos'}, ${motion.kind === 'pose' ? 'pose' : 'gesto'})`,
      description: motion.description ?? '',
      action: motion.kind === 'pose' ? 'cmd/avatar/pose' : 'cmd/avatar/gesture',
      payload: motion.kind === 'pose' ? { pose: motion.name, duration: motion.duration } : { gesture: motion.name, duration: motion.duration },
    })
  }
  const order = { pose: 0, gesto: 1, animacao: 2, criado: 3 }
  return entries.sort((a, b) => order[a.group] - order[b.group] || a.name.localeCompare(b.name))
}

/** The `mosquitto_pub` line of an entry, for a broker host and a site. */
export function mosquittoCommand(entry: Pick<MotionDirectoryEntry, 'action' | 'payload'>, host: string, site: string) {
  return `mosquitto_pub -h ${host} -t "neoalice/v1/${site}/${entry.action}" -m '${JSON.stringify(entry.payload)}'`
}

/** The bones and face shapes of the avatar, for the download button of the motions page. */
export function avatarRigDownload() {
  return avatarRigData()
}
