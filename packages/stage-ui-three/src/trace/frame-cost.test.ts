import type { VrmUpdateFrameTracePayload } from './types'

import { describe, expect, it } from 'vitest'

import { VrmFrameCostWindow, vrmFrameSteps } from './frame-cost'

function frame(durationMs: number, springBoneMs: number): VrmUpdateFrameTracePayload {
  const steps = Object.fromEntries(vrmFrameSteps.map(step => [step, 0])) as Record<(typeof vrmFrameSteps)[number], number>
  return { ...steps, springBoneMs, durationMs, deltaMs: 1000 / 30, ts: 0 }
}

describe('vrmFrameCostWindow', () => {
  it('gives the fps, the average, the 95th percentile, and the average of each step', () => {
    const costs = new VrmFrameCostWindow()
    for (let i = 1; i <= 20; i++)
      costs.add(frame(i, i / 2))

    expect(costs.take()).toMatchObject({ frames: 20, fps: 30, averageMs: 10.5, p95Ms: 20, steps: { springBoneMs: 5.25, lipSyncMs: 0 } })
  })

  it('starts a new window after each summary', () => {
    const costs = new VrmFrameCostWindow()
    costs.add(frame(2, 1))
    costs.take()

    expect(costs.take()).toBeUndefined()
  })
})
