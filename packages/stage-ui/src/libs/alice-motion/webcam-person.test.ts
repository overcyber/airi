import { describe, expect, it } from 'vitest'

import { personPositionOfFace } from './webcam-person'

describe('personPositionOfFace', () => {
  it('gives the point between the eyes, inside the image, and null without a face', () => {
    const landmarks = Array.from({ length: 478 }, () => ({ x: 0.9, y: 0.9 }))
    landmarks[168] = { x: 0.3, y: 0.4 }
    expect(personPositionOfFace(landmarks)).toEqual({ x: 0.3, y: 0.4 })

    landmarks[168] = { x: -0.2, y: 1.3 }
    expect(personPositionOfFace(landmarks)).toEqual({ x: 0, y: 1 })

    expect(personPositionOfFace([])).toBeNull()
    expect(personPositionOfFace(undefined)).toBeNull()
  })
})
