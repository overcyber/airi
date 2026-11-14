import type { MocapEngine } from '@proj-airi/model-driver-mediapipe'

import { errorMessageFrom } from '@moeru/std'

/** The point of the face that the avatar looks at: between the eyes, landmark 168 of the MediaPipe face mesh. */
const faceAnchorIndex = 168
/** Face detections per second. The look-at eases, so 10 is smooth and light on the mirror computer. */
const faceDetectionHz = 10
/** Without a face for this time, nobody is in front of the screen. */
const faceLostAfterMs = 1500

export type WebcamPersonStatus = 'off' | 'starting' | 'on' | 'error'

/**
 * The center of a face in the camera image, from 0 to 1 (x to the right, y down), as the camera sees it.
 *
 * Before: the normalized face landmarks of MediaPipe, or none.
 * After: the point between the eyes, or `null` without a face.
 */
export function personPositionOfFace(landmarks: ReadonlyArray<{ x: number, y: number }> | undefined): { x: number, y: number } | null {
  const anchor = landmarks?.[faceAnchorIndex] ?? landmarks?.[0]
  if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y))
    return null
  return { x: Math.min(1, Math.max(0, anchor.x)), y: Math.min(1, Math.max(0, anchor.y)) }
}

/**
 * Finds the person in front of the screen with the webcam of this browser, for the `person` tracking mode.
 *
 * It works the same in a browser, in the desktop app, and in the mobile app, when the app lets the page use the
 * camera. The MediaPipe face model loads at the first start from `storage.googleapis.com`.
 * Nothing leaves the device: the frames stay in the page.
 */
export class WebcamPersonTracker {
  status: WebcamPersonStatus = 'off'
  private stream?: MediaStream
  private video?: HTMLVideoElement
  private engine?: MocapEngine
  private lastFaceMs = 0
  private running = false

  /** `onPosition` gets the person position at each detection, and `null` when the face is lost. */
  constructor(private readonly onPosition: (position: { x: number, y: number } | null) => void) {}

  async start() {
    if (this.running)
      return
    this.running = true
    this.status = 'starting'
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('this browser has no camera access')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 }, audio: false })
      if (!this.running) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      this.stream = stream
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      await video.play()
      this.video = video

      const { createMediaPipeBackend, createMocapEngine } = await import('@proj-airi/model-driver-mediapipe')
      const engine = createMocapEngine(createMediaPipeBackend(), {
        enabled: { pose: false, hands: false, face: true },
        hz: { pose: 0, hands: 0, face: faceDetectionHz },
        maxPeople: 1,
      })
      await engine.init()
      if (!this.running)
        return
      this.engine = engine
      engine.start({ getFrame: () => video }, (state) => {
        const position = state.face?.hasFace ? personPositionOfFace(state.face.landmarks2d) : null
        if (position) {
          this.lastFaceMs = state.t
          this.onPosition(position)
        }
        else if (state.t - this.lastFaceMs > faceLostAfterMs) {
          this.onPosition(null)
        }
      }, {
        onError: (error) => {
          this.status = 'error'
          console.warn('[webcam-person] face detection stopped:', errorMessageFrom(error) ?? 'unknown error')
          this.onPosition(null)
        },
      })
      this.status = 'on'
      console.info('[webcam-person] following the person in front of the camera')
    }
    catch (error) {
      this.status = 'error'
      console.warn('[webcam-person] the webcam is not available, the avatar keeps the rest gaze:', errorMessageFrom(error) ?? 'unknown error')
      this.stopDevices()
      this.running = false
      this.onPosition(null)
    }
  }

  stop() {
    this.running = false
    this.stopDevices()
    this.status = 'off'
    this.onPosition(null)
  }

  private stopDevices() {
    this.engine?.stop()
    this.engine = undefined
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = undefined
    if (this.video)
      this.video.srcObject = null
    this.video = undefined
  }
}
