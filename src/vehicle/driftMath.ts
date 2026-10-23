import { clamp, DEG, len2, signedAngle, type Vec2 } from '../core/math'

/** Spec §8 thresholds. */
export const DRIFT_MIN_SLIP_DEG = 12
export const DRIFT_MIN_SPEED = 8
const SLIP_MIN_SPEED = 0.5

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

export const HANDBRAKE_REAR_GRIP = 0.35
export const CLUTCH_KICK_SECONDS = 0.3

/**
 * Multiplier on rear lateral grip. Handbrake locks the rears; a clutch kick
 * (clutchKickT = seconds of kick remaining) dumps grip under throttle.
 */
export function rearGripScale(c: { handbrake: boolean; clutchKickT: number; throttle: number; speed: number }): number {
  if (c.handbrake) return HANDBRAKE_REAR_GRIP
  if (c.clutchKickT > 0) return 1 - 0.5 * clamp(c.throttle, 0, 1)
  // Mild power-oversteer when flooring it at moderate speed.
  const powerOver = 0.12 * clamp(c.throttle, 0, 1) * clamp(1 - Math.abs(c.speed - 18) / 18, 0, 1)
  return 1 - powerOver
}

/**
 * Adds counter-steer toward the slide (steer +1 = right). The assist aims the
 * front wheels along the direction of travel (lock ≈ slip angle), fading in
 * over 8° above the drift threshold. `strength` 1 = full alignment.
 */
export function counterSteerAssist(slipDeg: number, steerInput: number, strength: number, lockDeg = 38): number {
  const a = Math.abs(slipDeg)
  if (a < DRIFT_MIN_SLIP_DEG) return steerInput
  const fadeIn = Math.min(1, (a - DRIFT_MIN_SLIP_DEG) / 8)
  const assist = -Math.sign(slipDeg) * strength * Math.min(1, a / lockDeg) * fadeIn
  return clamp(steerInput + assist, -1, 1)
}
