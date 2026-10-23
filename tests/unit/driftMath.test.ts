import { describe, expect, it } from 'vitest'
import { carConfig } from '../../src/vehicle/carConfig'
import { DriftCommand, handbrakeDirection, isDrifting, lateralGrip, pathLateralAccel, slipAngleDeg, targetSlipDeg } from '../../src/vehicle/driftMath'

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

describe('DriftCommand (drift axis, + = right)', () => {
  const c = (drift: number, steer = 0, handbrake = false) => ({ drift, steer, handbrake })
  const V = 20 // m/s, rolling
  it('passes the drift axis through, ignoring stick noise', () => {
    const d = new DriftCommand()
    expect(d.resolve(c(0.7), 0, V)).toBe(0.7)
    expect(d.resolve(c(-1, 1, true), 0, V)).toBe(-1) // the drift axis beats the handbrake
    expect(d.resolve(c(0.03), 0, V)).toBe(0)
  })
  it('a fresh handbrake press goes toward the steer; with the steer neutral it keeps the slide', () => {
    expect(new DriftCommand().resolve(c(0, 0.4, true), 0, V)).toBe(1)
    expect(new DriftCommand().resolve(c(0, -0.2, true), 0, V)).toBe(-1)
    expect(new DriftCommand().resolve(c(0, 0.5, true), -30, V)).toBe(1) // steer beats the old slide
    expect(new DriftCommand().resolve(c(0, 0.05, true), -30, V)).toBe(-1) // neutral steer: the slide's side
    expect(new DriftCommand().resolve(c(0, 0, true), 3, V)).toBe(0) // straight line: nothing
    expect(new DriftCommand().resolve(c(0, 0.5, false), 30, V)).toBe(0)
  })
  it('latches until release: counter-steer does not flip the drift', () => {
    const d = new DriftCommand()
    expect(d.resolve(c(0, 1, true), 0, V)).toBe(1)
    expect(d.resolve(c(0, -1, true), 40, V)).toBe(1) // counter-steer mid-drift
    expect(d.resolve(c(0, -1, true), -10, V)).toBe(1)
  })
  it('a quick release and re-press with opposite steer flicks the other way (S-bend)', () => {
    const d = new DriftCommand()
    d.resolve(c(0, 1, true), 0, V)
    expect(d.resolve(c(0, 1, true), 43, V)).toBe(1)
    expect(d.resolve(c(0, -1, false), 43, V)).toBe(0) // one tick released, still sliding right
    expect(d.resolve(c(0, -1, true), 40, V)).toBe(-1)
  })
  it('the drift axis used with the handbrake held moves the latch', () => {
    // drifting with J/L, press Space, release J/L: the side the axis chose stays
    const d = new DriftCommand()
    d.resolve(c(-1), -30, V)
    expect(d.resolve(c(-1, 1, true), -30, V)).toBe(-1)
    expect(d.resolve(c(0, 1, true), -30, V)).toBe(-1)
    // Space latched right, overridden with J (left), J released: no snap back right
    const e = new DriftCommand()
    expect(e.resolve(c(0, 1, true), 0, V)).toBe(1)
    expect(e.resolve(c(-0.6, 1, true), 30, V)).toBe(-0.6)
    expect(e.resolve(c(0, 1, true), -20, V)).toBe(-1)
  })
  it('does not latch until rolling, then picks the first direction there is', () => {
    const d = new DriftCommand()
    expect(d.resolve(c(0, 1, true), 0, 1)).toBe(0) // standing: nothing latched
    expect(d.resolve(c(0, 0, true), 0, V)).toBe(0)
    expect(d.resolve(c(0, -0.5, true), 0, V)).toBe(-1)
    expect(d.resolve(c(0, 1, true), 0, V)).toBe(-1)
  })
  it('handbrakeDirection: steer first, then the slide', () => {
    expect(handbrakeDirection(-1, 10)).toBe(-1)
    expect(handbrakeDirection(0.1, 10)).toBe(1)
    expect(handbrakeDirection(0.1, 2)).toBe(0)
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

