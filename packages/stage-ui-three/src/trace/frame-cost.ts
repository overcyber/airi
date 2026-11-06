import type { VrmUpdateFrameTracePayload } from './types'

/** The VRM update steps of one frame, in the order of `VRMModel.vue`. */
export const vrmFrameSteps = [
  'vrmFrameHookMs',
  'animationMixerMs',
  'humanoidMs',
  'lookAtMs',
  'blinkAndSaccadeMs',
  'lipSyncMs',
  'emoteMs',
  'expressionMs',
  'vrmRuntimeHookMs',
  'nodeConstraintMs',
  'springBoneMs',
] as const satisfies readonly (keyof VrmUpdateFrameTracePayload)[]

export type VrmFrameStep = (typeof vrmFrameSteps)[number]

export interface VrmFrameCostSummary {
  frames: number
  /** Frames per second, from the frame deltas. */
  fps: number
  /** Average VRM update time of a frame. */
  averageMs: number
  /** The slowest 5% of the frames take at least this long. */
  p95Ms: number
  /** Average time of each step. */
  steps: Record<VrmFrameStep, number>
}

/**
 * Collects the VRM update frames of the stage trace and sums them up (Plan 06, F4).
 *
 * Use when the mirror page measures the cost of each motion layer on the mirror computer.
 * `summary` returns `undefined` before the first frame.
 */
export class VrmFrameCostWindow {
  private frames: VrmUpdateFrameTracePayload[] = []

  add(frame: VrmUpdateFrameTracePayload) {
    this.frames.push(frame)
  }

  /** Sums up the frames since the last call, and starts a new window. */
  take(): VrmFrameCostSummary | undefined {
    const frames = this.frames
    this.frames = []
    if (frames.length === 0)
      return undefined
    const round = (value: number) => Math.round(value * 1000) / 1000
    const average = (read: (frame: VrmUpdateFrameTracePayload) => number) => round(frames.reduce((sum, frame) => sum + read(frame), 0) / frames.length)
    const durations = frames.map(frame => frame.durationMs).sort((a, b) => a - b)
    const deltaMs = average(frame => frame.deltaMs)
    return {
      frames: frames.length,
      fps: deltaMs > 0 ? Math.round(1000 / deltaMs * 10) / 10 : 0,
      averageMs: average(frame => frame.durationMs),
      p95Ms: round(durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))]),
      steps: Object.fromEntries(vrmFrameSteps.map(step => [step, average(frame => frame[step])])) as Record<VrmFrameStep, number>,
    }
  }
}
