import type RAPIER from '@dimforge/rapier3d-compat'
import { clamp, RAD, type Vec3 } from '../core/math'
import { add, cross, dot, norm, scale, sub, v3 } from '../core/vec3'
import type { CarConfig } from './carConfig'
import { DRIFT_INPUT_DEADBAND, pathLateralAccel, targetSlipDeg } from './driftMath'

const G = 9.81
const GRAVITY = v3(0, -G, 0)

/** Driver intent the controller acts on (drift already resolved from the legacy handbrake). */
export interface DriftInput {
  /** -1..1, + = drift right */
  drift: number
  /** -1..1, + = right */
  steer: number
  throttle: number
  brake: number
}

/** The car's state this tick, in world space. */
export interface DriftFrame {
  up: Vec3
  fwd: Vec3
  linvel: Vec3
  angvel: Vec3
  /** body slip β, radians, + = nose right of the path (velocity left of the nose) */
  slipRad: number
  /** share of wheels touching the ground, 0..1 */
  contactShare: number
  /** engine drive force available at this speed, N */
  driveForce: number
}

/**
 * Twin-axis drift controller (Inertial-Drift style). While the drift axis is
 * held it takes over the horizontal tyre forces from the raycast wheels
 * (`mix` → 1; the wheels keep doing suspension) and splits the car into two
 * independently driven quantities:
 *
 * - the PATH (velocity direction) turns at a rate set by the steer and drift
 *   axes (`pathLateralAccel`), friction-capped, with throttle feeding speed,
 *   lifting and braking scrubbing it;
 * - the BODY is servoed to a slip angle β relative to that path, commanded by
 *   the drift axis and rate limited, so the tail swings out and holds.
 *
 * On release the controller keeps the wheel for a moment and straightens the
 * body onto the path, then blends back to plain tyre grip. A slide past
 * `catchDeg` without drift input (a kerb, a rail hit) is caught the same way:
 * that is the only time it acts without drift input, and it only ever
 * straightens the car. Nothing ever commands more than `maxSlipDeg`, and the
 * body is pulled back hard past `antiSpinDeg`.
 */
export class DriftController {
  /** 0 = tyres own the horizontal forces, 1 = the controller does */
  mix = 0
  /** true while the drift axis is held (and the car is fast enough) */
  engaged = false
  /** true while engaged or straightening after a release / catch */
  private active = false
  /** rate-limited commanded slip, radians */
  private slipTarget = 0

  constructor(private readonly cfg: CarConfig) {}

  reset(): void {
    this.mix = 0
    this.engaged = false
    this.active = false
    this.slipTarget = 0
  }

  /** Update the mode and blend, then apply this tick's path and yaw impulses to `body`. */
  step(body: RAPIER.RigidBody, input: DriftInput, f: DriftFrame, h: number): void {
    const d = this.cfg.drift
    const vPlane = sub(f.linvel, scale(f.up, dot(f.linvel, f.up)))
    const speed = Math.hypot(vPlane.x, vPlane.y, vPlane.z)
    const slipDeg = Math.abs(f.slipRad) / RAD
    const moving = speed > d.minSpeed && dot(vPlane, f.fwd) > 0 && f.contactShare > 0

    const wasEngaged = this.engaged
    this.engaged = moving && Math.abs(input.drift) > DRIFT_INPUT_DEADBAND
    const recovering = !this.engaged && moving && slipDeg > d.releaseDeg && (this.active || slipDeg > d.catchDeg)
    // a fresh drift (or catch) swings from where the body is now, not from zero
    if ((this.engaged && !wasEngaged) || (!this.active && recovering)) this.slipTarget = f.slipRad
    this.active = this.engaged || recovering
    this.mix = clamp(this.mix + (this.active ? h / d.blendIn : -h / d.blendOut), 0, 1)

    const slipRate = this.swingSlipTarget(input, h)
    if (this.mix <= 0 || speed < 0.5) return
    const authority = this.mix * f.contactShare
    const tangent = scale(vPlane, 1 / speed)
    const left = norm(cross(f.up, tangent))

    // --- path: lateral (centripetal) + longitudinal acceleration along the ground plane ---
    const latRight = pathLateralAccel(this.engaged ? input.drift : 0, input.steer, input.brake, d)
    const pathRate = clamp(-latRight / Math.max(speed, 3), -d.maxPathRate, d.maxPathRate) // CCW (left) positive
    // cancel the slope's sideways pull so the line is the driver's, not the camber's
    const aLeft = speed * pathRate - dot(GRAVITY, left)
    const aLong = this.longitudinalAccel(input, f, speed)
    const cap = d.forceCap * this.cfg.mu * G
    const aMag = Math.hypot(aLeft, aLong)
    const k = aMag > cap ? cap / aMag : 1
    const accel = add(scale(left, aLeft * k), scale(tangent, aLong * k))
    body.applyImpulse(scale(accel, this.cfg.mass * authority * h), true)

    // --- body: servo the yaw rate so β follows the target (β = ψ_path − ψ_body) ---
    let slipErr = this.slipTarget - f.slipRad
    const limit = d.antiSpinDeg * RAD
    if (Math.abs(f.slipRad) > limit) slipErr -= Math.sign(f.slipRad) * (Math.abs(f.slipRad) - limit) * 4
    const yawTarget = pathRate - slipRate - d.slipGain * slipErr
    const yawNow = dot(f.angvel, f.up)
    const dYaw = (yawTarget - yawNow) * (1 - Math.exp(-d.yawServo * h))
    body.applyTorqueImpulse(scale(f.up, this.cfg.inertia.y * dYaw * authority), true)
  }

  /**
   * Move the commanded slip toward the pedal-shaped goal at the swing-rate
   * limit; returns its rate, rad/s. Braking with the drift axis held locks the
   * angle: the brake cancels the lift-off steepening and slows the swing right
   * down. After a release it holds nothing back, so brake + release straightens.
   */
  private swingSlipTarget(input: DriftInput, h: number): number {
    const d = this.cfg.drift
    const goal = this.engaged ? targetSlipDeg(input.drift, Math.max(input.throttle, input.brake), d) * RAD : 0
    const lock = this.engaged ? 1 - d.brakeLock * clamp(input.brake, 0, 1) : 1
    const maxStep = d.slipRateDegS * RAD * lock * h
    const step = clamp(goal - this.slipTarget, -maxStep, maxStep)
    this.slipTarget += step
    return step / h
  }

  /** Along the path: share of the drive, minus sideways scrub (eased by throttle) and the brake. */
  private longitudinalAccel(input: DriftInput, f: DriftFrame, speed: number): number {
    const d = this.cfg.drift
    const drive = (f.driveForce * d.driveShare) / this.cfg.mass
    const scrub = G * d.scrub * Math.abs(Math.sin(f.slipRad)) * (1 - d.throttleScrubCut * clamp(input.throttle, 0, 1))
    const brake = d.brakeDecel * clamp(input.brake, 0, 1)
    // never brake/scrub through zero in one tick
    return drive - Math.min(scrub + brake, speed * 20)
  }
}
