import type { CustomMotion } from '@proj-airi/alice-motion'

import type { ExecutableTool } from '../../stores/ai/chat-llm/tools'

import { avatarRigData, parseCustomMotion } from '@proj-airi/alice-motion'

export const avatarMotionToolName = 'avatar_motion'
export const avatarRigToolName = 'avatar_rig'

const motionDescription = [
  'Create and play a new pose or movement of the 3D avatar Alice, from her bones and face shapes.',
  'Call avatar_rig first to read the bones, their axes in degrees, their limits, and the face shapes.',
  'All axes at 0 is the standing rest pose with the arms down.',
  'format "bones": "keyframes" is a list of {"t": seconds, "bones": {"leftUpperArm": {"levantar": 160}}, "face": {"mouthSmileLeft": 0.4}}.',
  'A single pose can use "bones" and "face" without keyframes.',
  'format "talkinghead": "props" is a TalkingHead template, {"LeftArm.rotation": {"x": 0.5, "y": 0, "z": 1.2}} in radians.',
  'kind "pose" holds the body for "duration" seconds, kind "gesture" moves only its bones.',
  'With a "name" and "save": true, the motion is saved, and {"pose": name} or {"gesture": name} plays it later.',
  'Values over a limit are clamped, and the result lists what changed.',
].join(' ')

/** The JSON schema of a motion for the model. Extra fields pass to the check, which clamps or drops them. */
const motionParameters = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'lower snake case, for example saudacao. Needed to save.' },
    description: { type: 'string' },
    kind: { type: 'string', enum: ['pose', 'gesture'] },
    format: { type: 'string', enum: ['bones', 'talkinghead'] },
    duration: { type: 'number', description: 'seconds, 0.5 to 60' },
    mirror: { type: 'boolean', description: 'play it with the other side of the body' },
    save: { type: 'boolean' },
    keyframes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          t: { type: 'number' },
          bones: { type: 'object', additionalProperties: { type: 'object', additionalProperties: { type: 'number' } } },
          face: { type: 'object', additionalProperties: { type: 'number' } },
        },
      },
    },
    bones: { type: 'object', additionalProperties: { type: 'object', additionalProperties: { type: 'number' } } },
    face: { type: 'object', additionalProperties: { type: 'number' } },
    props: { type: 'object', additionalProperties: { type: 'object' } },
  },
} as const

export interface AvatarMotionToolHooks {
  /** Plays a checked motion on the stage. Returns `false` when the stage cannot. */
  play: (motion: CustomMotion) => boolean
  /** Keeps a named motion: the companion service saves it for every mirror. Resolves `false` when it cannot. */
  save: (motion: CustomMotion) => Promise<boolean>
}

/**
 * The tools of the LLM for the body of the avatar: `avatar_rig` reads the bones and the face shapes, and
 * `avatar_motion` creates, plays, and saves a pose or a movement. NeoAlice can run them with `cmd/avatar/tool`.
 */
export function createAvatarMotionTools(hooks: AvatarMotionToolHooks): ExecutableTool[] {
  return [
    {
      id: 'alice-avatar-rig',
      type: 'function',
      function: {
        name: avatarRigToolName,
        description: 'Read the bones of the 3D avatar Alice, their axes in degrees with limits, and her face shapes, to create a pose with avatar_motion.',
        parameters: { type: 'object', properties: {} },
      },
      execute: async () => avatarRigData(),
    },
    {
      id: 'alice-avatar-motion',
      type: 'function',
      function: { name: avatarMotionToolName, description: motionDescription, parameters: motionParameters },
      execute: async (input: unknown) => {
        const parsed = parseCustomMotion(input)
        if (!parsed.ok)
          return { ok: false, error: parsed.reason }
        const played = hooks.play(parsed.motion)
        const saved = parsed.save ? await hooks.save(parsed.motion) : false
        return { ok: played, played, saved, warnings: parsed.warnings }
      },
    },
  ]
}
