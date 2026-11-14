import { array, boolean, fallback, finite, looseObject, maxLength, number, optional, picklist, pipe, record, regex, safeParse, string, tuple, union, unknown } from 'valibot'

import { avatarFaceShapes, rigBone } from './avatar-rig'
import { rpmHumanBones } from './rpm-skeleton'

/**
 * A pose or a movement that an LLM creates, in one of two formats:
 *
 * - `bones`: key frames of anatomical axes in degrees on the VRM bones of `avatar-rig.ts`, plus face shapes.
 * - `talkinghead`: a TalkingHead template, `{"LeftArm.rotation": {"x": 0.5, "y": 0, "z": 1.2}}` in radians on the
 *   Ready Player Me bones, the format of `defineGesture` and `definePose` of the old mirror.
 *
 * {@link parseCustomMotion} checks it, clamps every value to its limits, and says what it clamped or dropped.
 */

export const customMotionKinds = ['pose', 'gesture'] as const
export type CustomMotionKind = (typeof customMotionKinds)[number]

export type TalkingHeadAxisValue = number | [number, number]
export type TalkingHeadTemplateProps = Record<string, { x: TalkingHeadAxisValue, y: TalkingHeadAxisValue, z: TalkingHeadAxisValue }>

export interface CustomMotionKeyframe {
  /** Seconds from the start. */
  t: number
  bones: Record<string, Record<string, number>>
  face: Record<string, number>
}

export interface CustomMotion {
  /** Lower snake case, for example `saudacao`. Unnamed motions play once and are not saved. */
  name?: string
  description?: string
  kind: CustomMotionKind
  format: 'bones' | 'talkinghead'
  /** Seconds. A gesture plays this long, a pose holds this long. */
  duration: number
  mirror: boolean
  keyframes: CustomMotionKeyframe[]
  props: TalkingHeadTemplateProps
}

export type CustomMotionResult
  = | { ok: true, motion: CustomMotion, save: boolean, warnings: string[] }
    | { ok: false, reason: string }

/** Largest motion, in bytes of JSON. */
export const maxCustomMotionBytes = 64 * 1024
const maxKeyframes = 64
const maxSeconds = 60
/** A template rotation stays in one turn each way. A hips position stays within 2 m. */
const maxRadians = Math.PI
const maxHipsMeters = 2

const MotionName = pipe(string(), maxLength(40), regex(/^[a-z][a-z0-9_]*$/, 'name must be lower snake case, for example saudacao'))
const Num = pipe(number(), finite())
const AxisValue = union([Num, tuple([Num, Num])])
const KeyframeSchema = looseObject({
  t: fallback(optional(Num), undefined),
  bones: fallback(optional(record(string(), record(string(), Num))), undefined),
  face: fallback(optional(record(string(), Num)), undefined),
})
const CustomMotionSchema = looseObject({
  name: optional(MotionName),
  description: fallback(optional(pipe(string(), maxLength(200))), undefined),
  kind: fallback(optional(picklist(customMotionKinds)), undefined),
  format: fallback(optional(picklist(['bones', 'talkinghead'])), undefined),
  duration: fallback(optional(Num), undefined),
  mirror: fallback(optional(boolean()), undefined),
  save: fallback(optional(boolean()), undefined),
  keyframes: optional(array(KeyframeSchema)),
  /** A single pose in the bones format, the same as one key frame. */
  bones: optional(record(string(), record(string(), Num))),
  face: optional(record(string(), Num)),
  props: optional(record(string(), unknown())),
  /** The `template` of `defineGesture` and `definePose`. A pose template keeps its rotations in `props`. */
  template: optional(record(string(), unknown())),
})

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const rpmNames = new Set(Object.values(rpmHumanBones))

function checkTemplate(raw: Record<string, unknown>, warnings: string[]): TalkingHeadTemplateProps {
  const props: TalkingHeadTemplateProps = {}
  for (const [key, value] of Object.entries(raw)) {
    const [bone, property] = key.split('.')
    if (!rpmNames.has(bone) || (property !== 'rotation' && (property !== 'position' || bone !== 'Hips'))) {
      warnings.push(`ignored ${key}: not a Ready Player Me bone rotation or Hips.position`)
      continue
    }
    const limit = property === 'rotation' ? maxRadians : maxHipsMeters
    const axes = safeParse(looseObject({ x: AxisValue, y: AxisValue, z: AxisValue }), value)
    if (!axes.success) {
      warnings.push(`ignored ${key}: needs x, y and z as numbers or [min, max]`)
      continue
    }
    const fit = (axis: TalkingHeadAxisValue): TalkingHeadAxisValue => {
      const fitted = typeof axis === 'number' ? clamp(axis, -limit, limit) : [clamp(axis[0], -limit, limit), clamp(axis[1], -limit, limit)] as [number, number]
      if (JSON.stringify(fitted) !== JSON.stringify(axis))
        warnings.push(`clamped ${key} to ${limit}`)
      return fitted
    }
    props[key] = { x: fit(axes.output.x), y: fit(axes.output.y), z: fit(axes.output.z) }
  }
  return props
}

function checkKeyframe(raw: { t?: number, bones?: Record<string, Record<string, number>>, face?: Record<string, number> }, t: number, warnings: string[]): CustomMotionKeyframe {
  const bones: CustomMotionKeyframe['bones'] = {}
  for (const [name, axes] of Object.entries(raw.bones ?? {})) {
    const rig = rigBone(name)
    if (!rig) {
      warnings.push(`ignored bone ${name}: see the bones of avatar-rig`)
      continue
    }
    const fitted: Record<string, number> = {}
    for (const [axis, value] of Object.entries(axes)) {
      const range = rig.axes[axis]
      if (!range) {
        warnings.push(`ignored ${name}.${axis}: the axes of ${name} are ${Object.keys(rig.axes).join(', ')}`)
        continue
      }
      fitted[axis] = clamp(value, range.min, range.max)
      if (fitted[axis] !== value)
        warnings.push(`clamped ${name}.${axis} from ${value} to ${fitted[axis]}`)
    }
    if (Object.keys(fitted).length > 0)
      bones[name] = fitted
  }
  const face: Record<string, number> = {}
  for (const [shape, value] of Object.entries(raw.face ?? {})) {
    if (!(shape in avatarFaceShapes)) {
      warnings.push(`ignored face shape ${shape}`)
      continue
    }
    face[shape] = clamp(value, 0, 1)
  }
  return { t, bones, face }
}

/**
 * Checks a motion from NeoAlice or from an LLM tool. It never throws.
 *
 * Before: any JSON value. After: a motion with every value inside its limits, and the warnings of what changed.
 */
export function parseCustomMotion(input: unknown): CustomMotionResult {
  let size = 0
  try {
    size = new TextEncoder().encode(JSON.stringify(input) ?? '').length
  }
  catch {
    return { ok: false, reason: 'the motion is not JSON' }
  }
  if (size > maxCustomMotionBytes)
    return { ok: false, reason: `the motion is larger than ${maxCustomMotionBytes} bytes` }
  const parsed = safeParse(CustomMotionSchema, input)
  if (!parsed.success)
    return { ok: false, reason: `${parsed.issues[0].path?.map(item => String(item.key)).join('.') ?? 'motion'}: ${parsed.issues[0].message}` }
  const raw = parsed.output
  const warnings: string[] = []
  const templateInput = raw.props ?? (raw.template && typeof raw.template.props === 'object' && raw.template.props !== null ? raw.template.props as Record<string, unknown> : raw.template)
  const format = raw.format ?? (templateInput ? 'talkinghead' : 'bones')
  // A template of `definePose` says `standing`, `sitting`, `kneeling` or `lying`: it is a pose.
  const kind = raw.kind ?? (raw.template && 'props' in raw.template ? 'pose' : 'gesture')
  const duration = clamp(raw.duration ?? (kind === 'pose' ? 10 : 3), 0.5, maxSeconds)

  let keyframes: CustomMotionKeyframe[] = []
  let props: TalkingHeadTemplateProps = {}
  if (format === 'talkinghead') {
    props = checkTemplate(templateInput ?? {}, warnings)
    if (Object.keys(props).length === 0)
      return { ok: false, reason: `no valid bone in the template${warnings.length ? `: ${warnings[0]}` : ''}` }
  }
  else {
    const frames = raw.keyframes ?? [{ t: 0, bones: raw.bones, face: raw.face }]
    if (frames.length === 0 || frames.length > maxKeyframes)
      return { ok: false, reason: `a motion needs 1 to ${maxKeyframes} key frames` }
    let last = -1
    for (const [index, frame] of frames.entries()) {
      // Key frames without a time are spread over the duration.
      const t = clamp(frame.t ?? (frames.length === 1 ? 0 : index * duration / (frames.length - 1)), 0, duration)
      if (t < last)
        return { ok: false, reason: 'the key frames must be in time order' }
      last = t
      keyframes.push(checkKeyframe(frame, t, warnings))
    }
    keyframes = keyframes.filter(frame => Object.keys(frame.bones).length > 0 || Object.keys(frame.face).length > 0)
    if (keyframes.length === 0)
      return { ok: false, reason: `no valid bone or face shape${warnings.length ? `: ${warnings[0]}` : ''}` }
  }

  return {
    ok: true,
    save: raw.save === true && raw.name !== undefined,
    warnings,
    motion: {
      ...(raw.name && { name: raw.name }),
      ...(raw.description && { description: raw.description }),
      kind,
      format,
      duration,
      mirror: raw.mirror === true,
      keyframes,
      props,
    },
  }
}
