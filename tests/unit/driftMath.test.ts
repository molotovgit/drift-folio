import { describe, expect, it } from 'vitest'
import { counterSteerAssist, isDrifting, lateralGrip, rearGripScale, slipAngleDeg } from '../../src/vehicle/driftMath'

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

describe('rearGripScale', () => {
  it('handbrake locks the rear to 0.35', () => {
    expect(rearGripScale({ handbrake: true, clutchKickT: 0, throttle: 0, speed: 20 })).toBeCloseTo(0.35)
  })
  it('is full grip off throttle', () => {
    expect(rearGripScale({ handbrake: false, clutchKickT: 0, throttle: 0, speed: 20 })).toBe(1)
  })
  it('clutch kick under throttle dumps grip', () => {
    expect(rearGripScale({ handbrake: false, clutchKickT: 0.2, throttle: 1, speed: 20 })).toBeLessThan(0.6)
  })
})

describe('counterSteerAssist', () => {
  it('steers into the slide', () => {
    expect(Math.sign(counterSteerAssist(25, 0, 0.6))).toBe(-1)
    expect(Math.sign(counterSteerAssist(-25, 0, 0.6))).toBe(1)
  })
  it('leaves input alone below 12°', () => {
    expect(counterSteerAssist(5, 0.4, 0.6)).toBe(0.4)
  })
  it('clamps to -1..1', () => {
    expect(counterSteerAssist(60, -1, 0.6)).toBe(-1)
  })
})
