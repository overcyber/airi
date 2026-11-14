import type { VRMAnimation } from '@pixiv/three-vrm-animation'
import type { VRMCore } from '@pixiv/three-vrm-core'
import type { AnimationClip } from 'three'
import type { Ref } from 'vue'

import { createVRMAnimationClip } from '@pixiv/three-vrm-animation'
import { Object3D, Vector3, VectorKeyframeTrack } from 'three'
import { randFloat } from 'three/src/math/MathUtils.js'
import { ref } from 'vue'

import { useVRMLoader } from './loader'
import { randomSaccadeInterval } from './utils/eye-motions'

export interface GLTFUserdata extends Record<string, any> {
  vrmAnimations: VRMAnimation[]
}

export async function loadVRMAnimation(url: string) {
  const loader = useVRMLoader()

  // load VRM Animation .vrma file
  const gltf = await loader.loadAsync(url)

  const userData = gltf.userData as GLTFUserdata
  if (!userData.vrmAnimations) {
    console.warn('No VRM animations found in the .vrma file')
    return
  }
  if (userData.vrmAnimations.length === 0) {
    console.warn('No VRM animations found in the .vrma file')
    return
  }

  return userData.vrmAnimations[0]
}

export async function clipFromVRMAnimation(vrm?: VRMCore, animation?: VRMAnimation) {
  if (!vrm) {
    console.warn('No VRM found')
    return
  }
  if (!animation) {
    return
  }

  // create animation clip
  return createVRMAnimationClip(animation, vrm)
}

/**
 * Shifts a clip's position tracks to start at the current normalized hips position.
 * Call before playback, with the rig in its rest pose. This mutates the clip and preserves relative motion between frames.
 */
export function reAnchorRootPositionTrack(clip: AnimationClip, _vrm: VRMCore) {
  const hipNode = _vrm.humanoid?.getNormalizedBoneNode('hips')
  if (!hipNode) {
    console.warn('No hips node found in VRM model.')
    return
  }
  // Tracks animate local positions. A world-space anchor bakes parent transforms into the clip,
  // and the animation mixer applies those transforms again during playback.
  const defaultHipPos = hipNode.position.clone()

  // Calculate the offset from the hips node to the hips's first frame position
  const hipsTrack = clip.tracks.find(track =>
    track instanceof VectorKeyframeTrack
    && track.name === `${hipNode.name}.position`,
  )
  if (!(hipsTrack instanceof VectorKeyframeTrack)) {
    console.warn('No Hips.position track of type VectorKeyframeTrack found in animation.')
    return
  }

  const animeHipPos = new Vector3(
    hipsTrack.values[0],
    hipsTrack.values[1],
    hipsTrack.values[2],
  )
  const animeDelta = new Vector3().subVectors(animeHipPos, defaultHipPos)

  clip.tracks.forEach((track) => {
    if (track.name.endsWith('.position') && track instanceof VectorKeyframeTrack) {
      for (let i = 0; i < track.values.length; i += 3) {
        track.values[i] -= animeDelta.x
        track.values[i + 1] -= animeDelta.y
        track.values[i + 2] -= animeDelta.z
      }
    }
  })
}

export function useBlink() {
  /**
   * Eye blinking animation
   */
  const isBlinking = ref(false)
  const blinkProgress = ref(0)
  const isCycleSuppressed = ref(false)
  const timeSinceLastBlink = ref(0)
  const BLINK_DURATION = 0.2 // Duration of a single blink in seconds
  const MIN_BLINK_INTERVAL = 1 // Minimum time between blinks
  const MAX_BLINK_INTERVAL = 6 // Maximum time between blinks
  const nextBlinkTime = ref(Math.random() * (MAX_BLINK_INTERVAL - MIN_BLINK_INTERVAL) + MIN_BLINK_INTERVAL)

  // Function to handle blinking animation
  function update(vrm: VRMCore | undefined, delta: number, options?: { suppress?: boolean }) {
    if (!vrm?.expressionManager)
      return

    timeSinceLastBlink.value += delta

    // Check if it's time for next blink
    if (!isBlinking.value && timeSinceLastBlink.value >= nextBlinkTime.value) {
      isBlinking.value = true
      blinkProgress.value = 0
      isCycleSuppressed.value = Boolean(options?.suppress)
    }

    // Handle blinking animation
    if (isBlinking.value) {
      blinkProgress.value += delta / BLINK_DURATION
      if (options?.suppress)
        isCycleSuppressed.value = true

      // Calculate blink value using sine curve for smooth animation.
      // While an emote owns the eye area, the controller keeps advancing so a
      // blink interrupted mid-cycle cannot leave the lid stuck closed.
      // If the cycle started under suppression or was suppressed mid-blink,
      // hold the morph at 0 until the cycle completes so releasing suppression
      // cannot pop the eyelid into a partially closed pose.
      const blinkValue = isCycleSuppressed.value ? 0 : Math.sin(Math.PI * blinkProgress.value)

      // Apply blink expression
      vrm.expressionManager.setValue('blink', blinkValue)

      // Reset blink when animation is complete
      if (blinkProgress.value >= 1) {
        isBlinking.value = false
        isCycleSuppressed.value = false
        timeSinceLastBlink.value = 0
        vrm.expressionManager.setValue('blink', 0) // Reset blink value to 0
        nextBlinkTime.value = Math.random() * (MAX_BLINK_INTERVAL - MIN_BLINK_INTERVAL) + MIN_BLINK_INTERVAL
      }
    }
    else if (options?.suppress) {
      // Release the lid when an emote begins between blinks.
      vrm.expressionManager.setValue('blink', 0)
    }
  }

  return { update }
}

/** Largest idle saccade from the look-at target, as seen from the eyes. */
const saccadeYawRadians = 4 * Math.PI / 180
const saccadePitchRadians = 2.5 * Math.PI / 180
/** How fast the eyes reach a new fixation, per second. */
const saccadeRate = 45

/**
 * Idle eye saccades: every 0.8 to 4.4 s the eyes jump to a point a few degrees from the look-at target,
 * like the eyes of a person who looks at a face. The target itself (the camera, the cursor, or the far
 * point ahead) is followed in every frame.
 */
export function useIdleEyeSaccades() {
  let nextSaccadeAfter = -1
  /** Offset of the current fixation from the look-at target, in meters at the target distance. */
  const fixationOffset = new Vector3()
  const fixationTarget = new Vector3()
  const eyePosition = new Vector3()
  let timeSinceLastSaccade = 0

  /**
   * A new fixation, up to 4 degrees to the side and 2.5 degrees up or down of the target, as seen from the
   * eyes. An offset in meters is wrong here: 25 cm is nothing at 100 m and a wide glance at 60 cm.
   */
  function pickFixationOffset(vrm: VRMCore, lookAtTarget: { x: number, y: number, z: number }) {
    vrm.lookAt!.getLookAtWorldPosition(eyePosition)
    const distance = Math.max(0.3, eyePosition.distanceTo(fixationTarget.set(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z)))
    fixationOffset.set(
      distance * Math.tan(randFloat(-saccadeYawRadians, saccadeYawRadians)),
      distance * Math.tan(randFloat(-saccadePitchRadians, saccadePitchRadians)),
      0,
    )
  }

  /**
   * Advances the idle saccades and sets the eye target from `lookAtTarget`, every frame.
   *
   * It does not call `vrm.lookAt.update()`: the VRM render loop (`VRMModel.vue`) calls that once per
   * frame itself, after it adds the mood gaze offset on top of the target this function sets.
   */
  function update(vrm: VRMCore | undefined, lookAtTarget: Ref<{ x: number, y: number, z: number }>, delta: number) {
    if (!vrm?.expressionManager || !vrm.lookAt)
      return

    if (timeSinceLastSaccade >= nextSaccadeAfter) {
      pickFixationOffset(vrm, lookAtTarget.value)
      timeSinceLastSaccade = 0
      nextSaccadeAfter = randomSaccadeInterval() / 1000
    }
    fixationTarget.set(lookAtTarget.value.x, lookAtTarget.value.y, lookAtTarget.value.z).add(fixationOffset)

    if (!vrm.lookAt.target) {
      // TODO: after bumping up to three 0.180.0 with @types/three 0.180.0,
      //   Argument of type 'Object3D<Object3DEventMap>' is not assignable to parameter of type 'Object3D<Object3DEventMap>'.
      //     Type 'Object3D<Object3DEventMap>' is missing the following properties from type 'Object3D<Object3DEventMap>': setPointerCapture, releasePointerCapture, hasPointerCapture
      //
      // Currently, AFAIK, https://github.com/pmndrs/xr/blob/456aa380206e93888cd3a5741a1534e672ae3106/packages/pointer-events/src/pointer.ts#L69-L100 declares
      // declare module 'three' {
      //   interface Object3D {
      //     setPointerCapture(pointerId: number): void
      //     releasePointerCapture(pointerId: number): void
      //     hasPointerCapture(pointerId: number): boolean

      //     intersectChildren?: boolean
      //     interactableDescendants?: Array<Object3D>
      //     /**
      //      * @deprecated
      //      */
      //     ancestorsHaveListeners?: boolean
      //     ancestorsHavePointerListeners?: boolean
      //     ancestorsHaveWheelListeners?: boolean
      //   }
      // }
      //
      // And in @tresjs/core v5, it uses the @pmndrs/pointer-events internally.
      // Somehow the Object3D from @types/three and the one augmented by @pmndrs/pointer-events are not compatible.
      // This needs to be fixed later.
      vrm.lookAt.target = new Object3D() as unknown as Object3D
    }

    // A saccade takes about 50 ms: fast, but not a jump in one frame.
    vrm.lookAt.target?.position.lerp(fixationTarget, 1 - Math.exp(-delta * saccadeRate))

    timeSinceLastSaccade += delta
  }

  function instantUpdate(vrm: VRMCore | undefined, lookAtTarget: { x: number, y: number, z: number }) {
    fixationTarget.set(
      lookAtTarget.x,
      lookAtTarget.y,
      lookAtTarget.z,
    )
    if (!vrm?.expressionManager || !vrm.lookAt)
      return
    if (!vrm.lookAt.target) {
      // TODO: after bumping up to three 0.180.0 with @types/three 0.180.0,
      //   Argument of type 'Object3D<Object3DEventMap>' is not assignable to parameter of type 'Object3D<Object3DEventMap>'.
      //     Type 'Object3D<Object3DEventMap>' is missing the following properties from type 'Object3D<Object3DEventMap>': setPointerCapture, releasePointerCapture, hasPointerCapture
      //
      // Currently, AFAIK, https://github.com/pmndrs/xr/blob/456aa380206e93888cd3a5741a1534e672ae3106/packages/pointer-events/src/pointer.ts#L69-L100 declares
      // declare module 'three' {
      //   interface Object3D {
      //     setPointerCapture(pointerId: number): void
      //     releasePointerCapture(pointerId: number): void
      //     hasPointerCapture(pointerId: number): boolean

      //     intersectChildren?: boolean
      //     interactableDescendants?: Array<Object3D>
      //     /**
      //      * @deprecated
      //      */
      //     ancestorsHaveListeners?: boolean
      //     ancestorsHavePointerListeners?: boolean
      //     ancestorsHaveWheelListeners?: boolean
      //   }
      // }
      //
      // And in @tresjs/core v5, it uses the @pmndrs/pointer-events internally.
      // Somehow the Object3D from @types/three and the one augmented by @pmndrs/pointer-events are not compatible.
      // This needs to be fixed later.
      vrm.lookAt.target = new Object3D() as unknown as Object3D
    }

    vrm.lookAt.target?.position.lerp(fixationTarget!, 1)
    vrm.lookAt?.update(0.016)
  }

  return { update, instantUpdate }
}
