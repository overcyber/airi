import type { VRMCore } from '@pixiv/three-vrm-core'
import type { Viseme } from '@proj-airi/model-driver-lipsync/shared/visemes'
import type { Profile, WLipSyncAudioNode, WLipSyncVowel } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import type { Ref } from 'vue'

import { createWLipSyncNode } from '@proj-airi/model-driver-lipsync/runtime/wlipsync'
import { ptBrVisemes, TextVisemeTrack } from '@proj-airi/model-driver-lipsync/shared/visemes'
import {
  createWLipSyncVowelDriver,
  SpeechEnvelope,
  WLIP_SYNC_VOWELS,
  wlipsyncProfile,
} from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import { ref, shallowRef, watch } from 'vue'

const VRM_EXPRESSION_BY_VOWEL: Record<WLipSyncVowel, string> = {
  A: 'aa',
  E: 'ee',
  I: 'ih',
  O: 'oh',
  U: 'ou',
}

/**
 * The default largest vowel weight on a VRM. The shared default (0.49) hardly opens the lips of a VRM.
 * The user changes it in the VRM settings (Lip sync, Mouth opening).
 */
const defaultMouthOpening = 0.6

/** How the mouth follows the speech: from the text in Brazilian Portuguese, or from the audio alone. */
export type VRMLipSyncMode = 'pt-BR' | 'audio'

/** The text of the speech clip that started playing. A new `id` starts the text lip sync again. */
export interface VRMSpeechText {
  id: number
  text: string
}

/** VRM expression weights of each mouth shape, before the mouth opening setting. `PP` and `sil` close the lips. */
const vrmWeightsOfViseme: Record<Viseme, Partial<Record<string, number>>> = {
  sil: {},
  PP: {},
  FF: { ih: 0.15 },
  DD: { ih: 0.3, aa: 0.15 },
  kk: { aa: 0.3, ih: 0.1 },
  CH: { ou: 0.3, ih: 0.2 },
  SS: { ih: 0.35 },
  nn: { ih: 0.25, aa: 0.1 },
  RR: { aa: 0.25, ih: 0.15 },
  aa: { aa: 1 },
  E: { ee: 0.7, aa: 0.3 },
  I: { ih: 0.8 },
  O: { oh: 0.9 },
  U: { ou: 0.85 },
}
const vrmVisemeNames = ['aa', 'ee', 'ih', 'oh', 'ou'] as const
/** Loudness over this share of the recent peak counts as voice for the text track. */
const voicedLevel = 0.12
/** Rate of the mouth toward the shape of the text, per second. */
const textMouthRate = 28

/** Options of {@link useVRMLipSync}. */
export interface VRMLipSyncOptions {
  /** The largest mouth opening, from 0.2 to 1. */
  mouthOpening?: Readonly<Ref<number | undefined>>
  /** The text of the playing speech clip. */
  speechText?: Readonly<Ref<VRMSpeechText | undefined>>
  /** `pt-BR` (default) uses the text when there is one. `audio` uses only the audio. */
  mode?: Readonly<Ref<VRMLipSyncMode | undefined>>
}

/**
 * Applies shared wLipSync vowel weights to a VRM expression manager.
 *
 * The caller owns the AudioContext and the played speech. `connectSpeech`
 * connects the wLipSync node to that speech and returns the disconnection.
 */
export function useVRMLipSync(
  audioContext: Readonly<Ref<AudioContext | undefined>>,
  connectSpeech: Readonly<Ref<((node: AudioNode) => () => void) | undefined>>,
  speechActive: Readonly<Ref<boolean | undefined>>,
  options: VRMLipSyncOptions = {},
) {
  const mouthOpening = options.mouthOpening ?? ref(undefined)
  const isLipSyncActive = ref(false)
  const lipSyncNode = shallowRef<WLipSyncAudioNode>()
  const ownsVisemes = ref(false)
  // The driver gives 0 to 1. The mouth opening setting scales it in each frame, so a change applies at once.
  const vowelDriver = createWLipSyncVowelDriver(undefined, { maxWeight: 1 })
  const envelope = new SpeechEnvelope()
  let textTrack: TextVisemeTrack | null = null
  const textMouth: Record<string, number> = { aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 }

  // Each new clip text starts a new track, like TalkingHead `speakAudio` with words.
  watch(() => options.speechText?.value?.id, () => {
    const speech = options.speechText?.value
    const steps = speech && (options.mode?.value ?? 'pt-BR') === 'pt-BR' ? ptBrVisemes(speech.text) : []
    textTrack = steps.length > 0 ? new TextVisemeTrack(steps) : null
  })

  /** The mouth from the text: the shape at the cursor, blended into the next one at the end of the step. */
  function textWeights(delta: number, level: number) {
    const frame = textTrack?.update(delta, level > voicedLevel)
    if (!frame) {
      textTrack = null
      return null
    }
    // The text waits at a pause for the audio. Meanwhile the audio vowels move the mouth.
    if (frame.waiting)
      return null
    const blend = Math.max(0, (frame.progress - 0.6) / 0.4)
    const current = vrmWeightsOfViseme[frame.current]
    const next = vrmWeightsOfViseme[frame.next]
    // A quiet syllable opens less, and a pause closes the mouth.
    const loudness = level > voicedLevel ? 0.6 + 0.4 * level : 0
    const rate = 1 - Math.exp(-textMouthRate * delta)
    for (const name of vrmVisemeNames) {
      const target = ((current[name] ?? 0) * (1 - blend) + (next[name] ?? 0) * blend) * loudness
      textMouth[name] += (target - textMouth[name]) * rate
    }
    return textMouth
  }

  watch(audioContext, (context, _, onCleanup) => {
    lipSyncNode.value = undefined
    vowelDriver.reset()
    envelope.reset()
    isLipSyncActive.value = false
    if (!context)
      return

    let active = true
    let createdNode: undefined | WLipSyncAudioNode
    onCleanup(() => {
      active = false
      createdNode?.disconnect()
    })

    void createWLipSyncNode(context, wlipsyncProfile as Profile)
      .then((node) => {
        createdNode = node
        envelope.configure(node)
        if (!active) {
          node.disconnect()
          return
        }
        lipSyncNode.value = node
      })
      .catch((error) => {
        if (active)
          console.error('[stage-ui-three] Failed to create the VRM lip-sync node.', error)
      })
  }, { immediate: true })

  watch([lipSyncNode, connectSpeech], ([node, connect], _, onCleanup) => {
    if (!node || !connect)
      return

    try {
      onCleanup(connect(node))
    }
    catch (error) {
      console.error('[stage-ui-three] Failed to connect the VRM lip-sync node.', error)
    }
  }, { immediate: true })

  function clearVisemes(vrm?: VRMCore) {
    if (!vrm?.expressionManager)
      return
    for (const vowel of WLIP_SYNC_VOWELS)
      vrm.expressionManager.setValue(VRM_EXPRESSION_BY_VOWEL[vowel], 0)
  }

  function releaseVisemes(vrm?: VRMCore) {
    if (!ownsVisemes.value)
      return
    ownsVisemes.value = false
    clearVisemes(vrm)
  }

  function update(vrm?: VRMCore, delta = 0.016) {
    if (!vrm?.expressionManager)
      return

    const node = lipSyncNode.value
    if (!node || speechActive.value === false) {
      isLipSyncActive.value = false
      vowelDriver.reset()
      envelope.reset()
      textTrack = null
      for (const name of vrmVisemeNames)
        textMouth[name] = 0
      releaseVisemes(vrm)
      return
    }

    ownsVisemes.value = true
    const level = envelope.update(node.volume, delta)
    const weights = vowelDriver.update({ volume: level, weights: node.weights }, delta)
    const opening = Math.min(Math.max(mouthOpening.value ?? defaultMouthOpening, 0.2), 1)
    // The text track, while it plays, gives the consonants that the audio vowels cannot: closed lips on p, b, m.
    const fromText = textWeights(delta, level)
    let hasActiveVisemes = false
    for (const vowel of WLIP_SYNC_VOWELS) {
      const name = VRM_EXPRESSION_BY_VOWEL[vowel]
      const weight = (fromText ? fromText[name] : weights[vowel]) * opening
      if (weight > 0.01)
        hasActiveVisemes = true
      vrm.expressionManager.setValue(name, weight)
    }

    isLipSyncActive.value = hasActiveVisemes
  }

  return {
    isLipSyncActive,
    update,
  }
}
