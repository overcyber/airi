import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'

import { Euler, Quaternion, Vector3 } from 'three'

import { proceduralAxisSign } from './procedural-axes'

/** Share of the lag that each bone takes, from the chest up. */
const lagBones: Array<[VRMHumanBoneName, number]> = [['chest', 0.35], ['upperChest', 0.25], ['neck', 0.2], ['head', 0.2]]

/** Spring of the lag: a little under critical damping, so the body settles with one small overshoot. */
const stiffness = 70
const damping = 2 * Math.sqrt(stiffness) * 0.65
/** Lag angle per unit of hips turn rate (rad/s), and lean per unit of hips acceleration (m/s²). */
const turnLag = 0.05
const accelerationLean = 0.012
/** Largest lag of the whole chain, in radians. */
const maxLag = 0.18
/** Frames longer than this are a pause, for example a hidden tab. They do not count as motion. */
const maxDeltaSeconds = 0.1

/**
 * Inertia of the upper body (Plan 08, M2): when the hips turn or accelerate, the chest and the head lag a moment
 * and settle with a small overshoot, as a real body does. Spring bones cannot do this, because VRM spring bones
 * move only bones outside the humanoid.
 *
 * Use it like `MoodBody`: {@link restore} before the mixer writes the pose, {@link apply} after it. All time comes
 * from the frame delta.
 */
export class BodyInertia {
  private readonly applied = new Map<VRMHumanBoneName, Quaternion>()
  private readonly offset = new Vector3()
  private readonly velocity = new Vector3()
  private lastHipsRotation: Quaternion | null = null
  private lastHipsPosition: Vector3 | null = null
  private lastHipsVelocity = new Vector3()
  private readonly scratch = new Quaternion()
  private readonly euler = new Euler()

  /** The current lag of the chain, in radians: pitch (x), yaw (y), and roll (z). For tests and diagnostics. */
  get lag(): Readonly<Vector3> {
    return this.offset
  }

  /** Undoes the rotations of the last frame. */
  restore(vrm: VRM) {
    for (const [name, rotation] of this.applied) {
      const bone = vrm.humanoid?.getNormalizedBoneNode(name)
      if (bone)
        bone.quaternion.multiply(this.scratch.copy(rotation).invert())
    }
    this.applied.clear()
  }

  /** Reads the hips motion of this frame and adds the lag to the upper body. */
  apply(vrm: VRM, deltaSeconds: number) {
    const hips = vrm.humanoid?.getNormalizedBoneNode('hips')
    if (!hips)
      return
    const delta = Math.min(Math.max(deltaSeconds, 0), maxDeltaSeconds)
    const rotation = hips.quaternion.clone()
    const position = hips.position.clone()
    const target = new Vector3()
    if (delta > 0 && deltaSeconds <= maxDeltaSeconds && this.lastHipsRotation && this.lastHipsPosition) {
      // Turn rate of the hips, in their own axes, from the change of rotation in this frame.
      const turn = this.lastHipsRotation.clone().invert().multiply(rotation)
      this.euler.setFromQuaternion(turn, 'XYZ')
      const rate = new Vector3(this.euler.x, this.euler.y, this.euler.z).divideScalar(delta)
      const velocity = position.clone().sub(this.lastHipsPosition).divideScalar(delta)
      const acceleration = velocity.clone().sub(this.lastHipsVelocity).divideScalar(delta)
      this.lastHipsVelocity.copy(velocity)
      // The chest stays behind the turn, and leans against a push of the hips.
      target.set(
        -rate.x * turnLag - acceleration.z * accelerationLean,
        -rate.y * turnLag,
        -rate.z * turnLag + acceleration.x * accelerationLean,
      )
      target.clampScalar(-maxLag, maxLag)
    }
    else {
      this.lastHipsVelocity.set(0, 0, 0)
    }
    this.lastHipsRotation = rotation
    this.lastHipsPosition = position

    // Damped spring toward the target, integrated on the frame clock.
    const force = target.sub(this.offset).multiplyScalar(stiffness).sub(this.velocity.clone().multiplyScalar(damping))
    this.velocity.addScaledVector(force, delta)
    this.offset.addScaledVector(this.velocity, delta).clampScalar(-maxLag, maxLag)

    const sign = proceduralAxisSign(vrm)
    for (const [name, share] of lagBones) {
      const bone = vrm.humanoid?.getNormalizedBoneNode(name)
      if (!bone)
        continue
      const rotationOffset = new Quaternion().setFromEuler(new Euler(sign * this.offset.x * share, this.offset.y * share, sign * this.offset.z * share, 'XYZ'))
      bone.quaternion.multiply(rotationOffset)
      this.applied.set(name, rotationOffset)
    }
  }
}
