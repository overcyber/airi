export const animations = {
  idleLoop: new URL('./idle_loop.vrma', import.meta.url),
}

/** One motion that the character can play once, for example a greeting. */
export interface VrmEmoteAnimation {
  id: string
  name: string
  /** Shown to the LLM so it can choose the emote. */
  description: string
  url: string
  /** File format. A blob URL of an imported file has no extension, so the format comes from the import. Default: `vrma`. */
  format?: 'vrma' | 'fbx'
  /**
   * The emote is a body pose that she holds, for example lying down. The clip up to `loopFromSeconds` brings her
   * into the pose, and the rest of the clip loops while she holds it. At the end, `exitUrl` plays (a clip in the
   * same format that starts in the pose), or the entry plays backwards without one.
   */
  pose?: { loopFromSeconds: number, exitUrl?: string }
}

/**
 * Motions that the VRM motion library plays. The idle pool cycles, the talking clip
 * plays while speech is audible, and the emotes play once on request.
 *
 * The files come from the Utsuwa project. See `./utsuwa/NOTICE.md`.
 */
export interface VrmMotionLibrary {
  idles: string[]
  talking?: string
  /**
   * Talking clips that take turns, a different one for each speech, for example the `Talking_0`, `Talking_1`,
   * and `Talking_2` FBX of the TalkingHead server. When it is not empty, it replaces `talking`.
   */
  talkingPool?: string[]
  /** Optional clip while the character waits for a reply. Without it, only the head reacts. */
  thinking?: string
  emotes: VrmEmoteAnimation[]
}

/**
 * Marker for the procedural thinking clip. The renderer builds it from the stage idle
 * with the hand-to-chin stance of `composables/vrm/thinking-pose.ts`. It is not a file.
 */
export const proceduralThinkingMotion = 'airi:procedural/thinking'

// NOTICE:
// Each URL is written as a literal `new URL('./file', import.meta.url)`.
// Vite copies an asset into the build only when it finds this literal pattern.
// Source: https://vite.dev/guide/assets#new-url-url-import-meta-url
// Removal condition: none while the assets ship with the package.
export const defaultVrmMotionLibrary: VrmMotionLibrary = {
  // idle-2 and idle-4 turn the head 37 to 65 degrees away. On the mirror, with a gesture over them, the avatar
  // looked twisted, so the pool keeps the three idles that face the viewer (head turn under 8 degrees).
  idles: [
    new URL('./utsuwa/idle-1.vrma', import.meta.url).toString(),
    new URL('./utsuwa/idle-3.vrma', import.meta.url).toString(),
    new URL('./utsuwa/idle-5.vrma', import.meta.url).toString(),
  ],
  talking: new URL('./utsuwa/talking.vrma', import.meta.url).toString(),
  thinking: proceduralThinkingMotion,
  emotes: [
    { id: 'show_full_body', name: 'Show Full Body', description: 'Step back and present the full avatar body', url: new URL('./utsuwa/emote-show-full-body.vrma', import.meta.url).toString() },
    { id: 'greeting', name: 'Greeting', description: 'Greet with a polite bowing motion', url: new URL('./utsuwa/emote-greeting.vrma', import.meta.url).toString() },
    { id: 'peace_sign', name: 'Peace Sign', description: 'Make a peace sign with the fingers', url: new URL('./utsuwa/emote-peace-sign.vrma', import.meta.url).toString() },
    { id: 'shoot', name: 'Shoot', description: 'Point finger forward like shooting', url: new URL('./utsuwa/emote-shoot.vrma', import.meta.url).toString() },
    { id: 'spin', name: 'Spin', description: 'Spin around once', url: new URL('./utsuwa/emote-spin.vrma', import.meta.url).toString() },
    { id: 'model_pose', name: 'Model Pose', description: 'Strike a confident model pose', url: new URL('./utsuwa/emote-model-pose.vrma', import.meta.url).toString() },
    { id: 'squat', name: 'Squat', description: 'Squat down briefly', url: new URL('./utsuwa/emote-squat.vrma', import.meta.url).toString() },

    // The NeoAlice motions of the owner (FBX, see neoalice/NOTICE.md), the same files as the mirror.
    { id: 'arms_open', name: 'Arms Open', description: 'Open both arms toward the viewer', url: new URL('./neoalice/arms-open.fbx', import.meta.url).toString(), format: 'fbx' },
    { id: 'bow', name: 'Bow', description: 'Bow politely', url: new URL('./neoalice/bow.fbx', import.meta.url).toString(), format: 'fbx' },
    { id: 'breathing_idle', name: 'Breathing Idle', description: 'Breathe calmly while standing', url: new URL('./neoalice/breathing-idle.fbx', import.meta.url).toString(), format: 'fbx' },
    { id: 'celebrate', name: 'Celebrate', description: 'Celebrate with both arms', url: new URL('./neoalice/celebrate.fbx', import.meta.url).toString(), format: 'fbx' },
    { id: 'head_nod', name: 'Head Nod', description: 'Nod yes', url: new URL('./neoalice/head-nod.fbx', import.meta.url).toString(), format: 'fbx' },
    { id: 'head_shake', name: 'Head Shake', description: 'Shake the head no', url: new URL('./neoalice/head-shake.fbx', import.meta.url).toString(), format: 'fbx' },
    { id: 'look_around', name: 'Look Around', description: 'Look around the room', url: new URL('./neoalice/look-around.fbx', import.meta.url).toString(), format: 'fbx' },
    { id: 'point_forward', name: 'Point Forward', description: 'Point forward with the hand', url: new URL('./neoalice/point-forward.fbx', import.meta.url).toString(), format: 'fbx' },
    { id: 'thinking', name: 'Thinking', description: 'Think with a hand to the chin', url: new URL('./neoalice/thinking.fbx', import.meta.url).toString(), format: 'fbx' },
    { id: 'wave_hello', name: 'Wave Hello', description: 'Wave hello with the hand', url: new URL('./neoalice/wave-hello.fbx', import.meta.url).toString(), format: 'fbx' },
    // A pose: 5 s from standing to lying on her side, then the rest of the clip loops while she rests.
    // She gets up with get-up.fbx: she pushes up on the arm, sits, comes to the knees, and stands.
    { id: 'lie_down', name: 'Lie Down', description: 'Lie down on the side and rest, head on the arm', url: new URL('./neoalice/lie-down.fbx', import.meta.url).toString(), format: 'fbx', pose: { loopFromSeconds: 5, exitUrl: new URL('./neoalice/get-up.fbx', import.meta.url).toString() } },
  ],
}
