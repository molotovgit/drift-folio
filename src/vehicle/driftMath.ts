import { clamp, DEG, len2, signedAngle, type Vec2 } from '../core/math'

/** Spec §8 thresholds. */
export const DRIFT_MIN_SLIP_DEG = 12
export const DRIFT_MIN_SPEED = 8
const SLIP_MIN_SPEED = 0.5
/** |drift| below this counts as "no drift input" (analog stick noise). */
export const DRIFT_INPUT_DEADBAND = 0.05
/** |steer| needed for the handbrake-drift to pick a drift direction. */
const HANDBRAKE_STEER_MIN = 0.15
/** with the steer neutral, a slide at least this big decides the handbrake-drift direction, degrees */
const HANDBRAKE_SLIDE_DEG = 4
/** below this speed a handbrake press does not pick a drift direction yet, m/s */
const HANDBRAKE_LATCH_SPEED = 2

/** Body slip angle β in degrees: heading → velocity, CCW (left) positive. 0 when nearly stopped. */
export function slipAngleDeg(heading: Vec2, velocity: Vec2): number {
  if (len2(velocity) < SLIP_MIN_SPEED) return 0
  return signedAngle(heading, velocity) * DEG
}

export function isDrifting(slipDeg: number, speed: number): boolean {
  return Math.abs(slipDeg) >= DRIFT_MIN_SLIP_DEG && speed >= DRIFT_MIN_SPEED
}

/**
 * Normalised lateral grip vs tyre slip angle: rises as a sine to 1 at the
 * peak, then eases down to a sliding plateau. Arcade "Pacejka-lite".
 */
export function lateralGrip(slipRad: number, peakRad: number, slideFactor: number): number {
  const s = Math.abs(slipRad)
  if (s <= peakRad) return Math.sin((s / peakRad) * (Math.PI / 2))
  const falloff = peakRad * 1.5
  return slideFactor + (1 - slideFactor) * Math.exp(-(s - peakRad) / falloff)
}

/**
 * Which way a fresh handbrake-drift goes (+1 right, -1 left, 0 none yet):
 * toward the steer, so a quick re-press with opposite lock flicks the car
 * the other way (S-bends); with the steer neutral an existing slide keeps
 * its side (slip > 0 is a right-hand slide: nose right of the path).
 */
export function handbrakeDirection(steer: number, slipDeg: number): number {
  if (Math.abs(steer) >= HANDBRAKE_STEER_MIN) return Math.sign(steer)
  if (Math.abs(slipDeg) >= HANDBRAKE_SLIDE_DEG) return Math.sign(slipDeg)
  return 0
}

/**
 * Resolves the drift axis the car acts on (-1..1, +1 = drift right). The
 * drift input wins; otherwise the handbrake-drift (Space / pad A / touch
 * DRIFT) drifts fully one way. Its direction is latched when it is first
 * known after the press (once rolling) and kept until release, so
 * counter-steering during a handbrake drift adjusts the line instead of
 * flipping the car across. While the drift axis is used with the handbrake
 * held, the latch follows the axis, so letting go of the axis keeps the side
 * it last chose. Handbrake alone in a straight line gives 0 (the car slows).
 */
export class DriftCommand {
  private latched = 0

  resolve(c: { drift: number; steer: number; handbrake: boolean }, slipDeg: number, speed: number): number {
    if (!c.handbrake) this.latched = 0
    if (Math.abs(c.drift) > DRIFT_INPUT_DEADBAND) {
      if (c.handbrake) this.latched = Math.sign(c.drift)
      return clamp(c.drift, -1, 1)
    }
    if (!c.handbrake) return 0
    if (this.latched === 0 && speed > HANDBRAKE_LATCH_SPEED) this.latched = handbrakeDirection(c.steer, slipDeg)
    return this.latched
  }

  reset(): void {
    this.latched = 0
  }
}

/**
 * Pedal shaping of the commanded drift angle (a forgiving "lift-off" car):
 * the throttle holds the base angle, lifting off steepens it. The brake does
 * not change the goal; the controller uses it to lock the current angle.
 */
export interface SlipShaping {
  /** body slip at full drift input on full throttle, degrees */
  maxSlipDeg: number
  /** angle multiplier with the throttle fully lifted (> 1 = lift steepens) */
  liftSlipGain: number
}

/** Target body slip, degrees (+ = drift right), for a drift axis value and throttle. */
export function targetSlipDeg(drift: number, throttle: number, s: SlipShaping): number {
  const pedal = s.liftSlipGain + (1 - s.liftSlipGain) * clamp(throttle, 0, 1)
  return clamp(drift, -1, 1) * s.maxSlipDeg * pedal
}

/** Path shaping: how hard the drift and steer axes bend the line. */
export interface PathShaping {
  /** lateral acceleration from full drift alone, in g */
  driftLatG: number
  /** lateral acceleration from full steer, in g */
  steerLatG: number
  /** extra line tightening at full brake (×(1 + this)) */
  brakeTighten: number
  maxLatG: number
}

/**
 * Commanded lateral acceleration of the path, m/s², + = curving right.
 * Drift right curves right; steer adds or subtracts (counter-steer straightens
 * the line); the brake tightens it.
 */
export function pathLateralAccel(drift: number, steer: number, brake: number, s: PathShaping): number {
  const g = 9.81
  const raw = (s.driftLatG * clamp(drift, -1, 1) + s.steerLatG * clamp(steer, -1, 1)) * (1 + s.brakeTighten * clamp(brake, 0, 1))
  return clamp(raw, -s.maxLatG, s.maxLatG) * g
}
