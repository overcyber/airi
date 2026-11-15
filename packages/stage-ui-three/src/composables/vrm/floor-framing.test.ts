import { describe, expect, it } from 'vitest'

import { blendFraming, easeInOut, floorFraming } from './floor-framing'

const input = { modelHeight: 1.9, floorY: 0, fovDegrees: 40, target: { x: 0, y: 1.29, z: 0 }, direction: { x: 0, z: -3 } }

describe('floorFraming', () => {
  it('shows the whole body, with the floor on the bottom edge of the view', () => {
    const framing = floorFraming(input)
    const half = framing.distance * Math.tan((40 / 2) * Math.PI / 180)
    // The bottom edge of the view is just under the floor, and the top edge is above the head.
    expect(framing.target.y - half).toBeCloseTo(-0.03, 5)
    expect(framing.target.y + half).toBeGreaterThan(1.9)
  })

  it('stands on the side of the direction, at the height of the target, and keeps the target x and z', () => {
    const framing = floorFraming({ ...input, target: { x: 0.2, y: 1.29, z: 0.1 } })
    expect(framing.position.y).toBeCloseTo(framing.target.y)
    expect(framing.position.z).toBeCloseTo(0.1 - framing.distance)
    expect(framing.position.x).toBeCloseTo(0.2)
  })

  it('follows a floor that is not at 0, and a direction that is not a unit vector', () => {
    const framing = floorFraming({ ...input, floorY: 0.5, direction: { x: 4, z: 3 } })
    expect(framing.target.y).toBeGreaterThan(floorFraming(input).target.y)
    expect(Math.hypot(framing.position.x - framing.target.x, framing.position.z - framing.target.z)).toBeCloseTo(framing.distance)
  })

  it('does not fail without a direction', () => {
    expect(floorFraming({ ...input, direction: { x: 0, z: 0 } }).position.z).toBeLessThan(0)
  })
})

describe('blendFraming', () => {
  it('gives the first camera at 0 and the second at 1', () => {
    const a = { target: { x: 0, y: 1, z: 0 }, position: { x: 0, y: 1, z: -2 }, distance: 2 }
    const b = { target: { x: 0, y: 0.5, z: 0 }, position: { x: 0, y: 0.5, z: -4 }, distance: 4 }
    expect(blendFraming(a, b, 0)).toEqual(a)
    expect(blendFraming(a, b, 1)).toEqual(b)
    expect(blendFraming(a, b, 0.5).distance).toBe(3)
  })

  it('eases in and out', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBe(0.5)
    expect(easeInOut(0.1)).toBeLessThan(0.1)
    expect(easeInOut(2)).toBe(1)
  })
})
