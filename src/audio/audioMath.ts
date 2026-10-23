/**
 * Pure audio mappings: gearbox model, engine pitch/gain curves and tyre levels.
 * No Web Audio types here, so everything is unit-testable in node.
 */
import type { Telemetry } from '../vehicle/driftCar'

/** Engine speed limits, rpm. */
export const IDLE_RPM = 900
export const REDLINE_RPM = 8500

/** Drift threshold (plan Global Constraints): below either, the tyres stay quiet. */
export const SQUEAL_MIN_SLIP_DEG = 12
export const SQUEAL_MIN_SPEED = 8 // m/s

/** 5-speed box roughly like the FD's; ratio × final drive gives engine revs per wheel rev. */
const GEAR_RATIOS = [3.48, 2.02, 1.39, 1.0, 0.72] as const
const FINAL_DRIVE = 4.1
const WHEEL_RADIUS = 0.32 // m, matches carConfig.wheelRadius
export const GEAR_COUNT = GEAR_RATIOS.length

/** Upshift point, rpm: short-shift when cruising, near the redline at full throttle. */
const SHIFT_RPM_LIGHT = 5200
const SHIFT_RPM_FULL = 8000
/** Extra revs from clutch slip when pulling away (1st gear, low speed), rpm. */
const LAUNCH_RPM = 2800

const clamp01 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x)
const finite = (x: number): number => (Number.isFinite(x) ? x : 0)

/** Hermite 0→1 between edges `a` and `b`. */
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Engine rpm the wheels force in `gear` (1-based) at `speed` m/s, ignoring idle/redline. */
export function wheelRpm(speed: number, gear: number): number {
  const ratio = GEAR_RATIOS[Math.min(Math.max(Math.round(gear), 1), GEAR_COUNT) - 1]
  const wheelRevPerMin = (Math.abs(finite(speed)) / (2 * Math.PI * WHEEL_RADIUS)) * 60
  return wheelRevPerMin * ratio * FINAL_DRIVE
}

/** Upshift rpm for a throttle position (0..1). */
export function shiftRpm(throttle: number): number {
  return SHIFT_RPM_LIGHT + (SHIFT_RPM_FULL - SHIFT_RPM_LIGHT) * clamp01(finite(throttle))
}

/**
 * Gear (1..5) for this speed and throttle: the lowest gear that keeps revs under the
 * shift point. Stateless, so the upshift rev drop falls out of the ratio step
 * (e.g. 1→2 at full throttle drops ~8000 → ~4600 rpm).
 */
export function selectGear(speed: number, throttle: number): number {
  const limit = shiftRpm(throttle)
  for (let g = 1; g < GEAR_COUNT; g++) {
    if (wheelRpm(speed, g) < limit) return g
  }
  return GEAR_COUNT
}

/** Engine rpm for the audio: wheel-driven revs in the selected gear, clutch slip at launch, idle..redline. */
export function engineRpm(speed: number, throttle: number): number {
  const t = clamp01(finite(throttle))
  const rpm = wheelRpm(speed, selectGear(speed, t))
  const launch = IDLE_RPM + LAUNCH_RPM * t
  return Math.min(Math.max(rpm, launch, IDLE_RPM), REDLINE_RPM)
}

/** 0 at idle → 1 at redline. */
export function rpmNorm(rpm: number): number {
  return clamp01((finite(rpm) - IDLE_RPM) / (REDLINE_RPM - IDLE_RPM))
}

/**
 * Firing frequency of a two-rotor Wankel, Hz: each rotor fires once per
 * eccentric-shaft revolution, so two pulses per rev (900 rpm → 30 Hz).
 */
export function firingHz(rpm: number): number {
  return (finite(rpm) / 60) * 2
}

/** Engine loudness 0..1: load (throttle) dominates, revs add a little; never silent at idle. */
export function engineGain(rpm: number, throttle: number): number {
  return 0.3 + 0.45 * clamp01(finite(throttle)) + 0.25 * rpmNorm(rpm)
}

/** Engine lowpass cutoff, Hz: opens with revs and load (closed throttle sounds muffled). */
export function engineCutoffHz(rpm: number, throttle: number): number {
  return 500 + 2600 * rpmNorm(rpm) * (0.45 + 0.55 * clamp01(finite(throttle)))
}

/**
 * Tyre squeal level 0..1. Silent below the drift threshold; ramps in over
 * 12→35° of slip and 8→25 m/s so the onset isn't a click.
 */
export function squealGain(slipDeg: number, speed: number): number {
  const slip = Math.abs(finite(slipDeg))
  const v = Math.abs(finite(speed))
  if (slip < SQUEAL_MIN_SLIP_DEG || v < SQUEAL_MIN_SPEED) return 0
  const slipT = 0.25 + 0.75 * smoothstep(SQUEAL_MIN_SLIP_DEG, 35, slip)
  const speedT = 0.35 + 0.65 * smoothstep(SQUEAL_MIN_SPEED, 25, v)
  return slipT * speedT
}

/** Squeal band centre, Hz: a little higher with speed. */
export function squealHz(speed: number): number {
  return 850 + 12 * Math.min(Math.abs(finite(speed)), 50)
}

/** Off-road rumble level 0..1: needs terrain contact and some speed; scales with wheels down (0..4). */
export function rumbleGain(speed: number, surface: 'road' | 'terrain' | null, wheelsOnGround: number): number {
  if (surface !== 'terrain') return 0
  const wheels = clamp01(finite(wheelsOnGround) / 4)
  return smoothstep(0.5, 20, Math.abs(finite(speed))) * wheels
}

/** Wind rush on top of the mountain ambience, 0..1 extra gain from speed. */
export function windRush(speed: number): number {
  return smoothstep(10, 60, Math.abs(finite(speed)))
}

export type Surface = 'road' | 'terrain' | null
export type Zone = 'mountain' | 'tunnel' | 'town'

/** Surface under the car as the audio sees it: airborne → null. */
export function surfaceOf(t: Pick<Telemetry, 'wheelsOnGround' | 'onRoad'>): Surface {
  if (t.wheelsOnGround <= 0) return null
  return t.onRoad ? 'road' : 'terrain'
}
