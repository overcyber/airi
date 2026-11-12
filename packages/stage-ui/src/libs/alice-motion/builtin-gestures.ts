/**
 * Built-in motions of the VRM stage for what NeoAlice says and shows.
 *
 * NeoAlice sends only TalkingHead gesture names, so the built-in motions (Wave Hello, Head Nod, Bow, and the
 * others) never played on her avatar. These rules pick one from the text of a speech in Brazilian Portuguese,
 * or from an emoji, like the emoji gestures of TalkingHead `speakText`.
 *
 * The result is a semantic action of the motion catalog: the motion name in lower snake case.
 */

/** The end of a word. `\b` of JavaScript does not know accented letters. */
const end = '(?=[\\s,.!?;:]|$)'

/**
 * A rule of a speech text. `actions` are the motions that fit the text, in order of preference: the picker
 * takes the first one that is not the last motion that played. A `social` rule (a greeting, a goodbye, a thank
 * you) always plays. Any other rule plays only now and then, so a reply that starts with "Sim" does not nod
 * every time.
 */
interface SpeechRule {
  pattern: RegExp
  actions: readonly string[]
  social?: boolean
}

/** Rules for a speech text, in order. The first rule that matches wins. */
const speechRules: SpeechRule[] = [
  { pattern: /^\s*(?:olá|ola|oi|bom dia|boa tarde|boa noite|seja bem|bem-vind)/i, actions: ['wave_hello', 'arms_open'], social: true },
  { pattern: new RegExp(`(?:tchau|até logo|até mais|até amanhã|até já)${end}`, 'i'), actions: ['wave_hello'], social: true },
  { pattern: /obrigad|agradeç|com licença|desculp/i, actions: ['bow', 'head_nod'], social: true },
  { pattern: /parabéns|que legal|incrível|maravilh|uhu|conseguimos|que ótimo|excelente/i, actions: ['celebrate', 'arms_open'] },
  { pattern: new RegExp(`^\\s*(?:sim|claro|com certeza|certo|isso mesmo|exatamente|pode deixar|perfeito)${end}`, 'i'), actions: ['head_nod'] },
  { pattern: new RegExp(`^\\s*(?:não|nunca|de jeito nenhum)${end}`, 'i'), actions: ['head_shake'] },
  { pattern: /deixa eu ver|vou verificar|vou pensar|hm{2,}|acho que|talvez|não sei/i, actions: ['thinking', 'look_around'] },
  { pattern: /que bom te ver|senti sua falta|vem cá|um abraço/i, actions: ['arms_open', 'wave_hello'] },
  { pattern: new RegExp(`(?:^|\\s)(?:olha|veja|aqui está|repare)${end}`, 'i'), actions: ['point_forward'] },
]

/** Rules for an emoji. */
const emojiRules: Array<[RegExp, string]> = [
  [/\u{1F44B}/u, 'wave_hello'],
  [/\u{1F64F}/u, 'bow'],
  [/\u{270C}/u, 'peace_sign'],
  [/[\u{1F973}\u{1F389}\u{1F38A}\u{1F929}]/u, 'celebrate'],
  [/\u{1F914}/u, 'thinking'],
  [/[\u{1F449}\u{261D}]/u, 'point_forward'],
  [/[\u{1F483}\u{1F57A}]/u, 'spin'],
  [/\u{1F60E}/u, 'model_pose'],
  [/\u{1F917}/u, 'arms_open'],
  [/\u{1F440}/u, 'look_around'],
]

/** The rule of a speech text, or `undefined` when no rule matches. */
export function speechGestureRule(text: string): { actions: readonly string[], social: boolean } | undefined {
  const rule = speechRules.find(({ pattern }) => pattern.test(text))
  return rule && { actions: rule.actions, social: rule.social === true }
}

/** The first built-in motion for a speech text, or `undefined` when no rule matches. */
export function builtinGestureOfSpeech(text: string): string | undefined {
  return speechGestureRule(text)?.actions[0]
}

/** The built-in motion for an emoji, or `undefined` when no rule matches. */
export function builtinGestureOfEmoji(emoji: string): string | undefined {
  return emojiRules.find(([rule]) => rule.test(emoji))?.[1]
}

export interface SpeechGesturePickerOptions {
  /** Share of the non-social speeches with a matching rule that get a motion. Default 0.45. */
  chance?: number
  /** Shortest time between two non-social speech motions. Default 14 s. */
  minimumGapMs?: number
  random?: () => number
}

/**
 * Picks the built-in motion of each speech, so the motions do not repeat.
 *
 * - A social rule (greeting, goodbye, thanks) always plays.
 * - Any other rule plays with `chance`, and never within `minimumGapMs` of the last speech motion.
 * - The motion is the first of the rule that is not the motion of the last speech.
 *
 * Same rules as TalkingHead, which gestures on emoji only. The NeoAlice avatar on the mirror nodded on every
 * "Sim" and pointed on every "Olha", and the repetition read as a tic.
 */
export class SpeechGesturePicker {
  private lastAction: string | undefined
  private lastAtMs = Number.NEGATIVE_INFINITY
  private readonly chance: number
  private readonly minimumGapMs: number
  private readonly random: () => number

  constructor(options: SpeechGesturePickerOptions = {}) {
    this.chance = options.chance ?? 0.45
    this.minimumGapMs = options.minimumGapMs ?? 14_000
    this.random = options.random ?? Math.random
  }

  /** The motion of a speech that starts at `nowMs`, or `undefined` for none. */
  pick(text: string, nowMs: number): string | undefined {
    const rule = speechGestureRule(text)
    if (!rule)
      return undefined
    if (!rule.social) {
      if (nowMs - this.lastAtMs < this.minimumGapMs || this.random() >= this.chance)
        return undefined
    }
    const action = rule.actions.find(candidate => candidate !== this.lastAction) ?? rule.actions[0]
    this.lastAction = action
    this.lastAtMs = nowMs
    return action
  }
}
