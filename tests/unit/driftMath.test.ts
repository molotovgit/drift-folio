import { describe, expect, it } from 'vitest'
import { carConfig } from '../../src/vehicle/carConfig'
import { driftCommand, isDrifting, lateralGrip, pathLateralAccel, slipAngleDeg, targetSlipDeg } from '../../src/vehicle/driftMath'

const r = (deg: number) => (deg * Math.PI) / 180

describe('slipAngleDeg', () => {
  it('is the signed angle from heading to velocity', () => {
    expect(slipAngleDeg({ x: 1, y: 0 }, { x: Math.cos(r(30)), y: Math.sin(r(30)) })).toBeCloseTo(30, 1)
    expect(slipAngleDeg({ x: 1, y: 0 }, { x: 10 * Math.cos(r(-20)), y: 10 * Math.sin(r(-20)) })).toBeCloseTo(-20, 1)
  })
  it('is 0 below 0.5 m/s', () => {
    expect(slipAngleDeg({ x: 1, y: 0 }, { x: 0.1, y: 0.1 })).toBe(0)
  })
})

describe('isDrifting', () => {
  it('needs 12° and 8 m/s', () => {
    expect(isDrifting(12, 8)).toBe(true)
    expect(isDrifting(-30, 20)).toBe(true)
    expect(isDrifting(11.9, 20)).toBe(false)
    expect(isDrifting(30, 7.9)).toBe(false)
  })
})

describe('lateralGrip', () => {
  it('is 0 at zero slip, 1 at the peak, and plateaus while sliding', () => {
    expect(lateralGrip(0, r(8), 0.7)).toBe(0)
    expect(lateralGrip(r(8), r(8), 0.7)).toBeCloseTo(1)
    expect(lateralGrip(r(40), r(8), 0.7)).toBeCloseTo(0.7, 1)
    expect(lateralGrip(-r(8), r(8), 0.7)).toBeCloseTo(1)
  })
  it('never exceeds 1', () => {
    for (let d = 0; d < 90; d += 1) expect(lateralGrip(r(d), r(8), 0.7)).toBeLessThanOrEqual(1 + 1e-9)
  })
})

describe('driftCommand (drift axis, + = right)', () => {
  const c = (drift: number, steer = 0, handbrake = false) => ({ drift, steer, handbrake })
  it('passes the drift axis through, ignoring stick noise', () => {
    expect(driftCommand(c(0.7), 0)).toBe(0.7)
    expect(driftCommand(c(-1, 1, true), 0)).toBe(-1) // the drift axis beats the handbrake
    expect(driftCommand(c(0.03), 0)).toBe(0)
  })
  it('legacy handbrake drifts fully toward the steer direction', () => {
    expect(driftCommand(c(0, 0.4, true), 0)).toBe(1)
    expect(driftCommand(c(0, -0.2, true), 0)).toBe(-1)
  })
  it('handbrake without steer keeps an existing slide, or gives nothing in a straight line', () => {
    expect(driftCommand(c(0, 0, true), -30)).toBe(-1)
    expect(driftCommand(c(0, 0, true), 3)).toBe(0)
    expect(driftCommand(c(0, 0.5, false), 30)).toBe(0)
  })
})

describe('targetSlipDeg', () => {
  const s = carConfig.drift
  it('full drift on throttle is the max angle (45–60°), mirrored for left', () => {
    expect(targetSlipDeg(1, 1, s)).toBe(s.maxSlipDeg)
    expect(s.maxSlipDeg).toBeGreaterThanOrEqual(45)
    expect(s.maxSlipDeg).toBeLessThanOrEqual(60)
    expect(targetSlipDeg(-1, 1, s)).toBe(-s.maxSlipDeg)
  })
  it('lifting off steepens it (lift-off car), but never to the anti-spin limit', () => {
    expect(targetSlipDeg(1, 0, s)).toBeGreaterThan(targetSlipDeg(1, 1, s) + 4)
    expect(targetSlipDeg(1, 0, s)).toBeLessThanOrEqual(60)
    expect(Math.abs(targetSlipDeg(-5, 0, s))).toBeLessThan(s.antiSpinDeg - 10)
  })
})

describe('pathLateralAccel (+ = curving right)', () => {
  const s = carConfig.drift
  it('drift curves toward its side; steer adds, counter-steer subtracts', () => {
    const drift = pathLateralAccel(1, 0, 0, s)
    expect(drift).toBeGreaterThan(0)
    expect(pathLateralAccel(1, 1, 0, s)).toBeGreaterThan(drift)
    expect(pathLateralAccel(1, -1, 0, s)).toBeLessThan(drift)
    expect(pathLateralAccel(-1, 0, 0, s)).toBeCloseTo(-drift)
  })
  it('the brake tightens the line, capped at maxLatG', () => {
    expect(pathLateralAccel(1, 0, 1, s)).toBeGreaterThan(pathLateralAccel(1, 0, 0, s))
    expect(pathLateralAccel(1, 1, 1, s)).toBeCloseTo(s.maxLatG * 9.81)
  })
})

