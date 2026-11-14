/** The head stays this far below the eye line of the camera, so the face is in the view and not at its top edge. */
const headBelowEyes = 0.15

/** How fast the lift follows its goal, per second. A lying down of some seconds then rises with the body. */
const liftRate = 1.5

/**
 * Keeps a lying body in a view that frames the head and the chest, like the desktop window.
 *
 * Use `goal` for the lift that puts the head near the eye height of the camera, and `step` to ease toward it on the
 * frame clock. When the pose ends, the goal is 0 and the model comes back down.
 */
export class FloorLift {
  /** The lift now, in meters. */
  value = 0

  /**
   * @param eyeHeight The eye height of the camera, in meters.
   * @param headY The world height of the head bone with the current lift, in meters.
   */
  goal(eyeHeight: number, headY: number): number {
    return Math.max(0, eyeHeight - headBelowEyes - (headY - this.value))
  }

  /** Moves the lift toward `goal` for a frame of `delta` seconds and returns it. */
  step(goal: number, delta: number): number {
    this.value += (goal - this.value) * Math.min(1, delta * liftRate)
    if (goal === 0 && this.value < 0.002)
      this.value = 0
    return this.value
  }
}
