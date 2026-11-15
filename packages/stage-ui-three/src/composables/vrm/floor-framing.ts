import type { Vec3 } from '../../stores/model-store'

/** The camera of a view: where it looks, where it stands, and how far. */
export interface CameraFraming {
  target: Vec3
  position: Vec3
  distance: number
}

/** How much more than the height of the model the view shows, so the head is not at the top edge. */
const viewOverHeight = 1.2

/** The floor is this far above the bottom edge of the view, in meters, so the boots are not cut by it. */
const floorMargin = 0.03

/**
 * The camera of a window that frames only the head and the chest, when she goes to the floor: the whole body in the
 * view, and the floor on the bottom edge of the window.
 *
 * Use it for the desktop window. She lies on the bottom edge, and the window is her floor. Without it, the lying body
 * was below the window, and lifting it made her hover in the middle.
 *
 * @param input.modelHeight The height of the model, in meters.
 * @param input.floorY The height of the floor of the model, in meters.
 * @param input.fovDegrees The vertical field of view of the camera.
 * @param input.target Where the camera looks now: only `x` and `z` are used.
 * @param input.direction The side the camera stands on, from the target, on the floor plane. It does not have to be a unit vector.
 */
export function floorFraming(input: {
  modelHeight: number
  floorY: number
  fovDegrees: number
  target: Vec3
  direction: { x: number, z: number }
}): CameraFraming {
  const half = (input.modelHeight * viewOverHeight) / 2
  const distance = half / Math.tan((input.fovDegrees / 2) * Math.PI / 180)
  const length = Math.hypot(input.direction.x, input.direction.z)
  const side = length > 1e-6 ? { x: input.direction.x / length, z: input.direction.z / length } : { x: 0, z: -1 }
  const target = { x: input.target.x, y: input.floorY - floorMargin + half, z: input.target.z }
  return {
    target,
    position: { x: target.x + side.x * distance, y: target.y, z: target.z + side.z * distance },
    distance,
  }
}

/** A camera between two cameras. `amount` goes from 0 (the first) to 1 (the second). */
export function blendFraming(from: CameraFraming, to: CameraFraming, amount: number): CameraFraming {
  const mix = (a: number, b: number) => a + (b - a) * amount
  const mixVec = (a: Vec3, b: Vec3): Vec3 => ({ x: mix(a.x, b.x), y: mix(a.y, b.y), z: mix(a.z, b.z) })
  return { target: mixVec(from.target, to.target), position: mixVec(from.position, to.position), distance: mix(from.distance, to.distance) }
}

/** An ease in and out, for the move of the camera. */
export function easeInOut(amount: number): number {
  const t = Math.min(1, Math.max(0, amount))
  return t * t * (3 - 2 * t)
}
