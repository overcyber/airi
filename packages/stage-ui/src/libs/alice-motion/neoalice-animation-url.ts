/**
 * The animations of the TalkingHead avatar of the mirror by name (`ANIMATIONS` of `neoalice_moves.mjs`),
 * for a `cmd/avatar/animation` with `name` and no `url`. Keys are lower case without spaces.
 */
const talkingHeadAnimations: Record<string, string> = {
  idle: 'animations_arkit/Standing_Idle.fbx',
  talk: 'animations_arkit/Talking_0.fbx',
  explain: 'animations_arkit/Talking_1.fbx',
  emphatic: 'animations_arkit/Talking_2.fbx',
  rumba: 'animations_arkit/Rumba.fbx',
  laugh: 'animations_arkit/Laughing.fbx',
  angry: 'animations_arkit/Angry.fbx',
  cry: 'animations_arkit/Crying.fbx',
  fear: 'animations_arkit/Terrified.fbx',
  wave: 'animations_arkit/Wave_Hello.fbx',
  nod: 'animations_arkit/Head_Nod.fbx',
  shake: 'animations_arkit/Head_Shake.fbx',
  bow: 'animations_arkit/Bow.fbx',
  celebrate: 'animations_arkit/Celebrate.fbx',
  think: 'animations_arkit/Thinking.fbx',
  point: 'animations_arkit/Point_Forward.fbx',
  lookaround: 'animations_arkit/Look_Around.fbx',
  armsopen: 'animations_arkit/Arms_Open.fbx',
  breathe: 'animations_arkit/Breathing_Idle.fbx',
  walking: 'animations/walking.fbx',
}

/** A motion that the app ships, with its display name, for example `Wave Hello`. */
export interface BundledMotion {
  name: string
  url: string
}

/** Lower case letters and digits only: `Wave_Hello`, `wave-hello`, and `Wave Hello` give `wavehello`. */
function motionKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** File name without folders and extension, decoded: `.../Rumba%20Dancing.fbx` gives `Rumba Dancing`. */
function fileStem(path: string) {
  const last = path.split(/[?#]/)[0].split('/').pop() ?? ''
  let decoded = last
  try {
    decoded = decodeURIComponent(last)
  }
  catch {}
  return decoded.replace(/\.[a-z0-9]+$/i, '')
}

/** Folders of the TalkingHead server that the Alice Docker server also serves, at the same path. */
const servedFolders = /^\/(?:animations|animations_arkit|poses)\//i

/**
 * The URLs that the stage tries, in order, for a `cmd/avatar/animation` of NeoAlice.
 *
 * The mirror sends the URL of the TalkingHead server, for example `http://192.0.2.10:8081/poses/dance.fbx`.
 * 1. A file with the name of a motion in `bundled` plays that motion, from the app.
 * 2. A URL in `animations`, `animations_arkit`, or `poses` loads from the Alice server, at the same path. A page on
 *    HTTPS cannot load the HTTP URL of the TalkingHead server.
 * 3. The URL of the message. The TalkingHead server sends CORS headers, so the desktop app can load it when the
 *    Alice server does not serve the file, for example when the saved server is the NeoAlice API.
 *
 * Returns an empty list when there is nothing to load.
 */
export function resolveNeoAliceAnimationUrls(input: { url?: string, name?: string }, serverOrigin: string | undefined, bundled: readonly BundledMotion[] = []): string[] {
  const path = input.url ?? (input.name ? talkingHeadAnimations[input.name.toLowerCase().replace(/[\s_-]+/g, '')] : undefined)
  const own = path ? bundled.find(motion => motionKey(motion.name) === motionKey(fileStem(path))) : undefined
  if (own)
    return [own.url]
  if (!input.url)
    return path && serverOrigin ? [new URL(`/${path}`, serverOrigin).href] : []

  let parsed: URL
  try {
    parsed = new URL(input.url, serverOrigin ?? 'http://localhost/')
  }
  catch {
    return []
  }
  if (!/^https?:$/.test(parsed.protocol))
    return []
  const urls: string[] = []
  if (serverOrigin && servedFolders.test(parsed.pathname))
    urls.push(new URL(parsed.pathname, serverOrigin).href)
  if (!urls.includes(parsed.href))
    urls.push(parsed.href)
  return urls
}
