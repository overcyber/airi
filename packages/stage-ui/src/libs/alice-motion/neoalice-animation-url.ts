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

/** Folders of the TalkingHead server that the Alice Docker server also serves, at the same path. */
const servedFolders = /^\/(?:animations|animations_arkit|poses)\//i

/**
 * The URL that the stage loads for a `cmd/avatar/animation` of NeoAlice.
 *
 * The mirror sends the URL of the TalkingHead server, for example `http://192.0.2.10:8081/poses/dance.fbx`.
 * A page on HTTPS cannot load it, and that server sends no CORS headers. The Alice Docker server serves the
 * same folders (`animations`, `animations_arkit`, `poses`), so a URL in them loads from the Alice server.
 * Another HTTP URL stays as it is.
 *
 * Returns `undefined` when there is nothing to load.
 */
export function resolveNeoAliceAnimationUrl(input: { url?: string, name?: string }, serverOrigin: string | undefined): string | undefined {
  if (input.url) {
    let parsed: URL
    try {
      parsed = new URL(input.url, serverOrigin ?? 'http://localhost/')
    }
    catch {
      return undefined
    }
    if (serverOrigin && servedFolders.test(parsed.pathname))
      return new URL(parsed.pathname, serverOrigin).href
    return /^https?:$/.test(parsed.protocol) ? parsed.href : undefined
  }
  const path = input.name ? talkingHeadAnimations[input.name.toLowerCase().replace(/[\s_-]+/g, '')] : undefined
  return path && serverOrigin ? new URL(`/${path}`, serverOrigin).href : undefined
}
