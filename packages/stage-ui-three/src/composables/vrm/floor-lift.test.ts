import { describe, expect, it } from 'vitest'

import { FloorLift, windowFloorMargin } from './floor-lift'

describe('floorLift', () => {
  it('puts the floor of the model on the bottom edge of the window, and not in the middle', () => {
    const lift = new FloorLift()
    // The window shows from 0.9 m up. The model stands at 0.
    const goal = lift.goal(0.9, 0)
    expect(goal).toBeCloseTo(0.9 + windowFloorMargin)
    for (let frame = 0; frame < 600; frame++)
      lift.step(goal, 1 / 60)
    // The lowest part of the lying body, at 0 in the model, is now just above the bottom edge.
    expect(lift.value + 0).toBeCloseTo(0.9 + windowFloorMargin, 2)
  })

  it('does not lift when the floor is already in the view', () => {
    expect(new FloorLift().goal(-0.1, 0)).toBe(0)
  })

  it('counts the offset of the model, so a model that sits higher lifts less', () => {
    expect(new FloorLift().goal(0.9, 0.2)).toBeCloseTo(0.7 + windowFloorMargin)
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
