import type { PerspectiveCamera, Raycaster } from 'three'
import type { MaybeRefOrGetter } from 'vue'

import type { TrackingMode, Vec3 } from '../stores/model-store'

import { Vector2, Vector3 } from 'three'
import { computed, toValue } from 'vue'

interface VRMWorldContext {
  raycaster: Raycaster
  camera: PerspectiveCamera
  defaultLookAt: Vector3
}

export interface VRMEyeFocusSource {
  x: number
  y: number
}

/**
 * Size of the area in front of the screen that the person image covers, in meters at the camera.
 * A webcam sees about 60 degrees wide, that is, about 1.6 m at 1.5 m from the screen.
 */
const personAreaWidthMeters = 1.6
const personAreaHeightMeters = 0.9

/**
 * Maps cursor and camera tracking modes into a VRM world-space eye focus target.
 *
 * Use when:
 * - A VRM model needs a look-at target derived from scene-local cursor coordinates.
 * - The scene owns the screen bounds used to normalize pointer coordinates.
 *
 * Expects:
 * - Source coordinates are relative to the browser viewport or Electron window that contains the scene.
 * - Screen bounds are in the same client coordinate space as the source.
 *
 * Returns:
 * - A computed Three.js vector suitable for VRM eye focus updates.
 */
export function useVRMEyeFocusFor(options: {
  cameraPosition: MaybeRefOrGetter<Vec3>
  context: MaybeRefOrGetter<VRMWorldContext>
  screenBoundingBox: MaybeRefOrGetter<{ top: number, left: number, height: number, width: number }>
  source: MaybeRefOrGetter<VRMEyeFocusSource | null | undefined>
  trackingMode: MaybeRefOrGetter<TrackingMode>
  /**
   * The center of the person in the camera image, from 0 to 1 (x to the right, y down), as the camera sees it,
   * not mirrored. `null` when nobody is in front of the screen. Only the `person` mode reads it.
   */
  person?: MaybeRefOrGetter<VRMEyeFocusSource | null | undefined>
}) {
  const focusPos = computed<Vector3>(() => {
    const trackingMode = toValue(options.trackingMode)
    if (trackingMode === 'camera') {
      const cameraPosition = toValue(options.cameraPosition)
      return new Vector3(cameraPosition.x, cameraPosition.y, cameraPosition.z)
    }

    const ctx = toValue(options.context)
    if (trackingMode === 'person') {
      const person = toValue(options.person)
      if (!person)
        return ctx.defaultLookAt
      return personToWorld(ctx, toValue(options.cameraPosition), person)
    }
    const trackingSource = toValue(options.source)
    if (trackingMode === 'none' || !trackingSource)
      return ctx.defaultLookAt
    const screen = toValue(options.screenBoundingBox)
    if (trackingMode === 'mouse') {
      const castedPos = castScreenToCam(
        ctx,
        new Vector2(
          ((trackingSource.x - screen.left) / screen.width) * 2 - 1,
          -((trackingSource.y - screen.top) / screen.height) * 2 + 1,
        ),
      )
      return castedPos
    }
    return ctx.defaultLookAt
  })

  return focusPos
}

/**
 * The point where the person stands, near the scene camera. The camera faces the person, so a person on the left
 * of the camera image stands on the right of the screen, as seen from the person.
 */
function personToWorld(ctx: VRMWorldContext, cameraPosition: Vec3, person: VRMEyeFocusSource): Vector3 {
  ctx.camera.updateMatrixWorld?.()
  const right = new Vector3().setFromMatrixColumn(ctx.camera.matrixWorld, 0).normalize()
  const up = new Vector3().setFromMatrixColumn(ctx.camera.matrixWorld, 1).normalize()
  const x = Math.min(1, Math.max(0, person.x))
  const y = Math.min(1, Math.max(0, person.y))
  return new Vector3(cameraPosition.x, cameraPosition.y, cameraPosition.z)
    .addScaledVector(right, (0.5 - x) * personAreaWidthMeters)
    .addScaledVector(up, (0.5 - y) * personAreaHeightMeters)
}

function castScreenToCam(ctx: VRMWorldContext, point: Vector2): Vector3 {
  ctx.raycaster.setFromCamera(point, ctx.camera)
  const nearPlaneDistance = ctx.camera.near
  const direction = ctx.raycaster.ray.direction.clone().normalize().multiplyScalar(8)
  const pointOnNearPlane = ctx.raycaster.ray.origin.clone()
    .add(direction.multiplyScalar(nearPlaneDistance))
  return pointOnNearPlane
}
