import { describe, expect, it } from 'vitest'

import { FloorLift } from './floor-lift'

describe('floorLift', () => {
  it('lifts a lying head up to the view of the upper body', () => {
    const lift = new FloorLift()
    // Eye height 1.4 m, the head of the lying body at 0.2 m.
    const goal = lift.goal(1.4, 0.2)
    expect(goal).toBeCloseTo(1.05)
    for (let frame = 0; frame < 600; frame++)
      lift.step(goal, 1 / 60)
    expect(lift.value).toBeCloseTo(1.05, 2)
    // With the lift on, the measured head is higher. The goal stays the same.
    expect(lift.goal(1.4, 0.2 + lift.value)).toBeCloseTo(1.05, 2)
  })

  it('does not lift a standing body', () => {
    const lift = new FloorLift()
    expect(lift.goal(1.4, 1.5)).toBe(0)
  })

  it('comes back down to exactly 0 after the pose', () => {
    const lift = new FloorLift()
    lift.value = 1
    for (let frame = 0; frame < 600; frame++)
      lift.step(0, 1 / 60)
    expect(lift.value).toBe(0)
  })

  it('does not jump past the goal on a long frame', () => {
    const lift = new FloorLift()
    expect(lift.step(1, 5)).toBe(1)
  })
})
