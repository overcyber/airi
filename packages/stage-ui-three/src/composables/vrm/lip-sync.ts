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
 * The largest vowel weight on a VRM. The shared default (0.49) opens the lips of a VRM only a few millimeters,
 * so the speech was not visible, mostly in the full-body view of the mirror.
 */
const vrmMaxVowelWeight = 0.9
/**
 * Share of the vowel weight that also opens the jaw, on a model with the ARKit `jawOpen` shape (for example a
 * converted Ready Player Me avatar). A smile of the mood face pulls the lips together, and the jaw keeps the mouth open.
 */
const jawShare = 0.2

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
) {
  const isLipSyncActive = ref(false)
  const lipSyncNode = shallowRef<WLipSyncAudioNode>()
  const ownsVisemes = ref(false)
  const vowelDriver = createWLipSyncVowelDriver(undefined, { maxWeight: vrmMaxVowelWeight })
  const envelope = new SpeechEnvelope()
  /** The `jawOpen` weight that the last frame wrote, so the next frame can tell it from a mood or emoji face. */
  let writtenJaw = 0

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
    if (writtenJaw > 0 && vrm.expressionManager.getValue('jawOpen') === writtenJaw)
      vrm.expressionManager.setValue('jawOpen', 0)
    writtenJaw = 0
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
    let hasActiveVisemes = false
    let mouth = 0
    for (const vowel of WLIP_SYNC_VOWELS) {
      const weight = weights[vowel]
      if (weight > 0.01)
        hasActiveVisemes = true
      mouth = Math.max(mouth, weight)
      vrm.expressionManager.setValue(VRM_EXPRESSION_BY_VOWEL[vowel], weight)
    }
    if (vrm.expressionManager.getExpression('jawOpen')) {
      // A value other than the one of the last frame comes from the mood or emoji face of this frame. Keep the larger one.
      const current = vrm.expressionManager.getValue('jawOpen') ?? 0
      const face = current === writtenJaw ? 0 : current
      writtenJaw = Math.max(face, mouth * jawShare)
      vrm.expressionManager.setValue('jawOpen', writtenJaw)
    }

    isLipSyncActive.value = hasActiveVisemes
  }

  return {
    isLipSyncActive,
    update,
  }
}
