import type { VRMCore } from '@pixiv/three-vrm-core'
import type { Profile, WLipSyncAudioNode, WLipSyncVowel } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import type { Ref } from 'vue'

import { createWLipSyncNode } from '@proj-airi/model-driver-lipsync/runtime/wlipsync'
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
  mouthOpening: Readonly<Ref<number | undefined>> = ref(undefined),
) {
  const isLipSyncActive = ref(false)
  const lipSyncNode = shallowRef<WLipSyncAudioNode>()
  const ownsVisemes = ref(false)
  // The driver gives 0 to 1. The mouth opening setting scales it in each frame, so a change applies at once.
  const vowelDriver = createWLipSyncVowelDriver(undefined, { maxWeight: 1 })
  const envelope = new SpeechEnvelope()

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
      releaseVisemes(vrm)
      return
    }

    ownsVisemes.value = true
    const weights = vowelDriver.update({ volume: envelope.update(node.volume, delta), weights: node.weights }, delta)
    const opening = Math.min(Math.max(mouthOpening.value ?? defaultMouthOpening, 0.2), 1)
    let hasActiveVisemes = false
    for (const vowel of WLIP_SYNC_VOWELS) {
      const weight = weights[vowel] * opening
      if (weight > 0.01)
        hasActiveVisemes = true
      vrm.expressionManager.setValue(VRM_EXPRESSION_BY_VOWEL[vowel], weight)
    }

    isLipSyncActive.value = hasActiveVisemes
  }

  return {
    isLipSyncActive,
    update,
  }
}
