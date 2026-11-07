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

/** Rules for a speech text, in order. The first rule that matches wins. */
const speechRules: Array<[RegExp, string]> = [
  [/^\s*(?:olá|ola|oi|bom dia|boa tarde|boa noite|seja bem|bem-vind)/i, 'wave_hello'],
  [new RegExp(`(?:tchau|até logo|até mais|até amanhã|até já)${end}`, 'i'), 'wave_hello'],
  [/obrigad|agradeç|com licença|desculp/i, 'bow'],
  [/parabéns|que legal|incrível|maravilh|uhu|conseguimos|que ótimo|excelente/i, 'celebrate'],
  [new RegExp(`^\\s*(?:sim|claro|com certeza|certo|isso mesmo|exatamente|pode deixar|perfeito)${end}`, 'i'), 'head_nod'],
  [new RegExp(`^\\s*(?:não|nunca|de jeito nenhum)${end}`, 'i'), 'head_shake'],
  [/deixa eu ver|vou verificar|vou pensar|hm{2,}|acho que|talvez|não sei/i, 'thinking'],
  [/que bom te ver|senti sua falta|vem cá|um abraço/i, 'arms_open'],
  [new RegExp(`(?:^|\\s)(?:olha|veja|aqui está|repare)${end}`, 'i'), 'point_forward'],
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

/** The built-in motion for a speech text, or `undefined` when no rule matches. */
export function builtinGestureOfSpeech(text: string): string | undefined {
  return speechRules.find(([rule]) => rule.test(text))?.[1]
}

/** The built-in motion for an emoji, or `undefined` when no rule matches. */
export function builtinGestureOfEmoji(emoji: string): string | undefined {
  return emojiRules.find(([rule]) => rule.test(emoji))?.[1]
}
