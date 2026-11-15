import * as v from 'valibot'

/** One node of the screen: a view with its text, its place, and what it can do. */
export interface ScreenNode {
  /** The number that `click_node`, `set_text`, and `scroll` use. It is valid until the next snapshot. */
  id: number
  className: string
  text?: string
  description?: string
  hint?: string
  viewId?: string
  /** Left, top, right, bottom, in pixels of the screen. */
  bounds: [number, number, number, number]
  clickable: boolean
  scrollable: boolean
  editable: boolean
  focused: boolean
  checked?: boolean
  /** A password field. The app never sends its text. */
  password: boolean
}

export interface ScreenSnapshot {
  /** The package of the app in front, for example `com.example.mail`. */
  packageName: string
  width: number
  height: number
  nodes: ScreenNode[]
  /** The tree had more nodes than the limit. */
  truncated: boolean
}

const coordinate = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(20000))
const nodeId = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100000))

/** The actions that the app can do on an Android screen. */
export const AndroidActionSchema = v.variant('type', [
  v.object({ type: v.literal('tap'), x: coordinate, y: coordinate }),
  v.object({ type: v.literal('long_press'), x: coordinate, y: coordinate }),
  v.object({
    type: v.literal('swipe'),
    x1: coordinate,
    y1: coordinate,
    x2: coordinate,
    y2: coordinate,
    durationMs: v.optional(v.pipe(v.number(), v.integer(), v.minValue(50), v.maxValue(3000))),
  }),
  v.object({ type: v.literal('click_node'), id: nodeId }),
  v.object({ type: v.literal('set_text'), id: v.optional(nodeId), text: v.pipe(v.string(), v.maxLength(2000)) }),
  v.object({ type: v.literal('scroll'), id: nodeId, direction: v.picklist(['forward', 'backward']) }),
  v.object({ type: v.literal('key'), key: v.picklist(['back', 'home', 'recents', 'notifications']) }),
  v.object({ type: v.literal('open_app'), packageName: v.pipe(v.string(), v.regex(/^[a-z]\w*(?:\.\w+)+$/i, 'not a package name')) }),
])

export type AndroidAction = v.InferOutput<typeof AndroidActionSchema>

export type ParsedAndroidAction = { ok: true, action: AndroidAction } | { ok: false, error: string }

/** Checks an action from the model or from NeoAlice. It never throws. */
export function parseAndroidAction(input: unknown): ParsedAndroidAction {
  const parsed = v.safeParse(AndroidActionSchema, input)
  if (parsed.success)
    return { ok: true, action: parsed.output }
  const issue = parsed.issues[0]
  return { ok: false, error: `${issue.path?.map(item => String(item.key)).join('.') || 'action'}: ${issue.message}` }
}

/** One line for the confirmation and for the activity list. It never holds a long text. */
export function describeAndroidAction(action: AndroidAction): string {
  switch (action.type) {
    case 'tap':
      return `tap at ${Math.round(action.x)}, ${Math.round(action.y)}`
    case 'long_press':
      return `long press at ${Math.round(action.x)}, ${Math.round(action.y)}`
    case 'swipe':
      return `swipe from ${Math.round(action.x1)}, ${Math.round(action.y1)} to ${Math.round(action.x2)}, ${Math.round(action.y2)}`
    case 'click_node':
      return `click view ${action.id}`
    case 'set_text':
      return `type ${action.text.length} characters${action.id === undefined ? ' in the focused field' : ` in view ${action.id}`}`
    case 'scroll':
      return `scroll view ${action.id} ${action.direction}`
    case 'key':
      return `press ${action.key}`
    case 'open_app':
      return `open the app ${action.packageName}`
  }
}

/** The result of an action on the device. */
export interface AndroidActionResult {
  ok: boolean
  /** Why it did not work, for the model. */
  error?: string
}
