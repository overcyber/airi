import type { CustomMotion } from '@proj-airi/alice-motion'

import type { BeatKind, BeatRole } from './speech-gesture-beats'

import { beatInfo, buildBeat } from './speech-gesture-beats'

/**
 * Picks and times the gestures of speech.
 *
 * It starts when the audio of a sentence starts, never before. Each gesture fits the part of the text that is
 * spoken at that time: a question gets an open hand, a "no" gets a chop, a count gets fingers. The pauses between
 * gestures change every time, and the last kinds do not come again soon, so the movement does not look like a loop.
 */

export interface SpeechGestureContext {
  /** True while something else owns the body: another gesture, a held pose, lying down, the night mode. */
  blocked: boolean
}

export interface SpeechGestureOptions {
  random?: () => number
}

/** How many characters per second a voice speaks. Used only to find the part of the text that is spoken now. */
const charactersPerSecond = 14
/** Largest delta in one frame, so a stalled tab does not skip a gesture. */
const maxDeltaSeconds = 0.1
/** The right hand is the one that she uses most. */
const rightHandShare = 0.65
/** A kind does not come again within this many gestures. */
const recentMemory = 5

const wordRoles: ReadonlyArray<readonly [BeatRole, readonly string[]]> = [
  ['negation', ['nao', 'nunca', 'nada', 'jamais', 'ninguem', 'nem', 'impossivel']],
  ['self', ['eu', 'meu', 'minha', 'meus', 'minhas', 'me', 'mim', 'comigo', 'sinto', 'acho', 'gosto', 'amo']],
  ['you', ['voce', 'voces', 'seu', 'sua', 'seus', 'suas', 'te', 'tu', 'contigo', 'vc']],
  ['point', ['isso', 'isto', 'aquilo', 'aqui', 'ali', 'la', 'este', 'esta', 'esse', 'essa', 'aquele', 'aquela', 'olha', 'veja', 'repare']],
  ['uncertain', ['talvez', 'acho', 'sera', 'depende', 'quem', 'quase', 'provavelmente', 'pode', 'poderia', 'duvida']],
  ['wide', ['muito', 'muita', 'muitos', 'muitas', 'grande', 'enorme', 'tudo', 'todos', 'todas', 'sempre', 'incrivel', 'imenso', 'mundo', 'infinito', 'demais']],
  ['small', ['pouco', 'pouca', 'pequeno', 'pequena', 'so', 'apenas', 'detalhe', 'rapidinho', 'minimo', 'sutil']],
  ['calm', ['calma', 'tranquilo', 'tranquila', 'devagar', 'paz', 'respira', 'relaxa', 'suave', 'aos', 'poucos']],
  ['emphasis', ['importante', 'realmente', 'exatamente', 'claro', 'principal', 'essencial', 'certeza', 'absolutamente', 'precisa', 'precisamos', 'lembre']],
  ['continue', ['e', 'mas', 'entao', 'porque', 'ou', 'porem', 'tambem', 'depois', 'ainda', 'assim', 'agora']],
  ['list', ['primeiro', 'segundo', 'terceiro', 'alem', 'outro', 'outra', 'tambem', 'seguida']],
]

const questionWords = new Set(['como', 'porque', 'qual', 'quais', 'quem', 'quando', 'onde', 'quanto', 'quantos', 'sera'])

const countOne = new Set(['um', 'uma', 'primeiro', 'primeira', '1'])
const countTwo = new Set(['dois', 'duas', 'segundo', 'segunda', '2'])
const countThree = new Set(['tres', 'terceiro', 'terceira', '3'])

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

/** The clauses of a text and where each one starts, so a time in the speech finds its clause. */
function clausesOf(text: string): Array<{ start: number, text: string }> {
  const clauses: Array<{ start: number, text: string }> = []
  const pattern = /[^,;.!?:]+[,;.!?:]*/g
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match[0].trim())
      clauses.push({ start: match.index, text: match[0] })
  }
  return clauses
}

/** The roles of a clause, with how many times each one shows up. */
export function rolesOfClause(clause: string): Map<BeatRole, number> {
  const roles = new Map<BeatRole, number>()
  const add = (role: BeatRole, amount = 1) => roles.set(role, (roles.get(role) ?? 0) + amount)
  const words = normalize(clause).split(/[^a-z0-9]+/).filter(Boolean)
  if (clause.includes('?') || (words.length > 0 && questionWords.has(words[0])))
    add('question', 2)
  if (clause.includes('!'))
    add('emphasis', 2)
  if ((clause.match(/,/g)?.length ?? 0) >= 2)
    add('list', 2)
  for (const word of words) {
    for (const [role, list] of wordRoles) {
      if (list.includes(word))
        add(role)
    }
    if (countOne.has(word) || countTwo.has(word) || countThree.has(word))
      add('count')
  }
  return roles
}

/** Which count gesture fits a clause: the first number word that it has. */
function countKindOf(clause: string): BeatKind {
  for (const word of normalize(clause).split(/[^a-z0-9]+/)) {
    if (countOne.has(word))
      return 'count_one'
    if (countTwo.has(word))
      return 'count_two'
    if (countThree.has(word))
      return 'count_three'
  }
  return 'count_one'
}

export class SpeechGestureChoreographer {
  private readonly random: () => number
  private clauses: Array<{ start: number, text: string }> = []
  private characters = 0
  private speaking = false
  private elapsedSeconds = 0
  private waitSeconds = 0
  private recent: BeatKind[] = []
  private lastSide: 'left' | 'right' = 'right'
  /** How lively this speech is. A different value each speech, so one sentence is calm and another is vivid. */
  private liveliness = 1

  constructor(options: SpeechGestureOptions = {}) {
    this.random = options.random ?? Math.random
  }

  get active() {
    return this.speaking
  }

  /** Call when the audio of a sentence starts. The first gesture comes a little later, not at once. */
  start(text: string) {
    this.clauses = clausesOf(text)
    this.characters = text.length
    this.speaking = text.trim().length > 0
    this.elapsedSeconds = 0
    this.liveliness = 0.7 + this.random() * 0.7
    this.waitSeconds = 0.5 + this.random() * 0.9
  }

  /** Call when the speech ends or a new one starts. Nothing plays after this. */
  stop() {
    this.speaking = false
    this.clauses = []
  }

  /** Advances by one frame. Returns the gesture to play now, or `null`. */
  update(deltaSeconds: number, context: SpeechGestureContext): CustomMotion | null {
    if (!this.speaking)
      return null
    const delta = Math.min(Math.max(deltaSeconds, 0), maxDeltaSeconds)
    this.elapsedSeconds += delta
    if (context.blocked)
      return null
    this.waitSeconds -= delta
    if (this.waitSeconds > 0)
      return null

    const remaining = this.characters / charactersPerSecond - this.elapsedSeconds
    // At the end of the speech a gesture would outlive the voice.
    if (remaining < 0.9) {
      this.waitSeconds = 0.3
      return null
    }

    const motion = this.pick()
    // Rest after a gesture: a share of its length plus a pause that changes. A vivid speech pauses less.
    const pause = (0.7 + this.random() * 2.4) / this.liveliness
    this.waitSeconds = motion.duration * (0.6 + this.random() * 0.5) + pause
    // Now and then a second gesture follows soon, like a person who is on a roll.
    if (this.random() < 0.14)
      this.waitSeconds *= 0.45
    return motion
  }

  private clauseNow(): string {
    if (this.clauses.length === 0)
      return ''
    const position = Math.floor(this.elapsedSeconds * charactersPerSecond)
    let current = this.clauses[0]
    for (const clause of this.clauses) {
      if (clause.start <= position)
        current = clause
    }
    return current.text
  }

  private pick(): CustomMotion {
    const clause = this.clauseNow()
    const roles = rolesOfClause(clause)
    const weights = beatInfo.map((info) => {
      let weight = 1
      for (const role of info.roles)
        weight += (roles.get(role) ?? 0) * 3
      // A gesture that the text does not ask for is rarer than one that fits, but it can still come.
      if (this.recent.includes(info.kind))
        weight *= 0.05
      // A beat of the head alone keeps the body alive when the hands rest.
      if (info.headOnly)
        weight *= 0.8
      return weight
    })
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    let roll = this.random() * total
    let kind = beatInfo[0].kind
    for (const [index, weight] of weights.entries()) {
      roll -= weight
      if (roll <= 0) {
        kind = beatInfo[index].kind
        break
      }
    }
    if (kind === 'count_one' || kind === 'count_two' || kind === 'count_three')
      kind = countKindOf(clause)

    this.recent.push(kind)
    if (this.recent.length > recentMemory)
      this.recent.shift()

    // The right hand mostly, and the other hand after a run of the same hand.
    let side: 'left' | 'right' = this.random() < rightHandShare ? 'right' : 'left'
    if (side === this.lastSide && this.random() < 0.25)
      side = side === 'right' ? 'left' : 'right'
    this.lastSide = side

    return buildBeat(kind, {
      side,
      amplitude: (0.7 + this.random() * 0.6) * (0.85 + this.liveliness * 0.15),
      tempo: 0.85 + this.random() * 0.35,
      random: this.random,
    })
  }
}
