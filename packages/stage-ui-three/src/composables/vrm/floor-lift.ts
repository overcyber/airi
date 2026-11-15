/** How fast the lift follows its goal, per second. A lying down of some seconds then rises with the body. */
const liftRate = 1.5

/** The body rests this far above the bottom edge of the window, so the boots are not cut by it. */
export const windowFloorMargin = 0.03

/**
 * Lets a lying body rest on the bottom edge of a window that frames only the head and the chest, like the desktop
 * window. The edge is the floor of the window: the body lies on it and does not hover in the middle.
 *
 * Use `goal` for the lift that puts the floor of the model on the bottom edge, and `step` to ease toward it on the
 * frame clock. When the pose ends, the goal is 0 and the model comes back down.
 */
export class FloorLift {
  /** The lift now, in meters. */
  value = 0

  /**
   * @param bottomEdgeY The world height of the bottom edge of the view, in meters.
   * @param floorY The world height of the floor of the model without any lift, in meters.
   */
  goal(bottomEdgeY: number, floorY: number): number {
    return Math.max(0, bottomEdgeY + windowFloorMargin - floorY)
  }

  /** Moves the lift toward `goal` for a frame of `delta` seconds and returns it. */
  step(goal: number, delta: number): number {
    this.value += (goal - this.value) * Math.min(1, delta * liftRate)
    if (goal === 0 && this.value < 0.002)
      this.value = 0
    return this.value
  }
}
