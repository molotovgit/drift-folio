import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { PHYSICS_STEP } from '../../src/core/loop'
import { carConfig } from '../../src/vehicle/carConfig'
import { targetSlipDeg } from '../../src/vehicle/driftMath'
import { carRig, pathYaw, upright } from './carRig'

beforeAll(async () => {
  await RAPIER.init()
})

const DEG = 180 / Math.PI
/** Unwrapped change of the path heading, degrees (+ = turned left). */
function pathTurn(): { add: (yaw: number) => void; total: () => number } {
  let prev: number | null = null
  let sum = 0
  return {
    add(yaw) {
      if (prev !== null) sum += Math.atan2(Math.sin(yaw - prev), Math.cos(yaw - prev))
      prev = yaw
    },
    total: () => sum * DEG,
  }
}

describe('twin-axis drift (Inertial-Drift style): the drift axis sets the body angle', () => {
  it('held drift at 22 m/s tracks the commanded slip within 0.5 s and holds it for 3 s on throttle', () => {
    const { car, run, launch } = carRig()
    launch(22)
    const want = targetSlipDeg(1, 1, carConfig.drift)
    let reachedAt = Infinity
    let worstAfter = 0
    let drifting = 0
    run(3.6, { throttle: 1, drift: 1 }, (c, t) => {
      const tel = c.telemetry()
      const err = Math.abs(tel.slipDeg - want)
      if (err < 4 && reachedAt === Infinity) reachedAt = t
      if (t > 0.6) worstAfter = Math.max(worstAfter, err)
      if (tel.drifting) drifting += PHYSICS_STEP
    })
    expect(want).toBeGreaterThanOrEqual(45)
    expect(want).toBeLessThanOrEqual(60)
    expect(reachedAt).toBeLessThan(0.5)
    expect(worstAfter).toBeLessThan(4)
    expect(drifting).toBeGreaterThan(3.3)
    expect(car.telemetry().speed).toBeGreaterThan(19) // throttle sustains the slide
    expect(upright(car)).toBeGreaterThan(0.9)
  })

  it('drift left mirrors drift right', () => {
    const { car, run, launch } = carRig()
    launch(22)
    run(1.5, { throttle: 1, drift: -1 })
    expect(car.telemetry().slipDeg).toBeCloseTo(-targetSlipDeg(1, 1, carConfig.drift), 0)
  })

  it('half drift input asks for about half the angle', () => {
    const { car, run, launch } = carRig()
    launch(22)
    run(1.5, { throttle: 1, drift: 0.5 })
    expect(car.telemetry().slipDeg).toBeCloseTo(targetSlipDeg(0.5, 1, carConfig.drift), 0)
  })

  it('releasing the drift axis realigns the body with the path: slip < 8° within 1 s, no overshoot spin', () => {
    const { car, run, launch } = carRig()
    launch(22)
    run(2, { throttle: 1, drift: 1 })
    let maxAfter = 0
    run(1, { throttle: 1 }, (c) => (maxAfter = Math.max(maxAfter, c.telemetry().slipDeg < 0 ? -c.telemetry().slipDeg : 0)))
    expect(Math.abs(car.telemetry().slipDeg)).toBeLessThan(8)
    expect(maxAfter).toBeLessThan(10) // the counter-swing past straight stays small
    run(2, {})
    expect(Math.abs(car.telemetry().slipDeg)).toBeLessThan(2)
    expect(car.driftMix).toBe(0) // back on plain tyre grip
  })

  it('lifting off scrubs more speed than throttle and steepens the angle (lift-off car)', () => {
    const lose = (throttle: number) => {
      const { car, run, launch } = carRig()
      launch(22)
      run(0.5, { throttle: 1, drift: 1 })
      const v0 = car.telemetry().speed
      run(2, { throttle, drift: 1 })
      return { dv: v0 - car.telemetry().speed, slip: car.telemetry().slipDeg }
    }
    const on = lose(1)
    const off = lose(0)
    expect(on.dv).toBeLessThan(2) // little speed loss on throttle
    expect(off.dv).toBeGreaterThan(on.dv + 4)
    expect(off.slip).toBeGreaterThan(on.slip + 4)
    expect(off.slip).toBeLessThan(carConfig.drift.antiSpinDeg - 10)
  })
})

describe('twin-axis drift: the steer axis draws the line', () => {
  /** Path heading change over `seconds` with the given inputs after a 0.6 s drift entry. */
  const turnWith = (c: { steer?: number; brake?: number; throttle?: number }, seconds = 1.5) => {
    const { car, run, launch } = carRig()
    launch(22)
    run(0.6, { throttle: 1, drift: 1 })
    const turn = pathTurn()
    const v0 = car.telemetry().speed
    run(seconds, { throttle: 1, drift: 1, ...c }, (cc) => turn.add(pathYaw(cc)))
    return { deg: -turn.total(), dv: v0 - car.telemetry().speed, slip: car.telemetry().slipDeg } // + = turned right
  }

  it('drift right curves the path right; steering into it tightens, counter-steer straightens', () => {
    const plain = turnWith({})
    const into = turnWith({ steer: 1 })
    const counter = turnWith({ steer: -1 })
    expect(plain.deg).toBeGreaterThan(15)
    expect(into.deg).toBeGreaterThan(plain.deg + 10)
    expect(counter.deg).toBeLessThan(plain.deg - 10)
    // the body angle stays the drift axis's: steering does not change it much
    for (const r of [plain, into, counter]) expect(Math.abs(r.slip - plain.slip)).toBeLessThan(6)
  })

  it('brake with the drift axis held locks the angle; brake after a release straightens', () => {
    const { car, run, launch } = carRig()
    launch(22)
    run(1, { throttle: 1, drift: 1 })
    const held = car.telemetry().slipDeg
    let drift = 0
    // a lift would steepen the angle; the brake holds it near where it was
    run(0.6, { brake: 1, drift: 1 }, (c) => (drift = Math.max(drift, Math.abs(c.telemetry().slipDeg - held))))
    expect(drift).toBeLessThan(4)
    run(1, { brake: 1 })
    expect(Math.abs(car.telemetry().slipDeg)).toBeLessThan(8)
  })

  it('brake during a drift tightens the line and costs more speed than throttle', () => {
    const throttle = turnWith({ throttle: 1 })
    const brake = turnWith({ throttle: 0, brake: 1 })
    expect(brake.deg).toBeGreaterThan(throttle.deg + 5)
    expect(brake.dv).toBeGreaterThan(throttle.dv + 5)
  })
})

describe('anti-spin and grip driving', () => {
  it('full steer + full throttle without the drift axis grips: slip never exceeds 10°', () => {
    for (const speed of [12, 22, 32]) {
      const { run, launch } = carRig()
      launch(speed)
      let maxSlip = 0
      run(4, { throttle: 1, steer: 1 }, (c) => (maxSlip = Math.max(maxSlip, Math.abs(c.telemetry().slipDeg))))
      expect(maxSlip, `at ${speed} m/s`).toBeLessThan(10)
    }
  })

  it('full brake + full steer from speed does not spin', () => {
    const { run, launch } = carRig()
    launch(30)
    let maxSlip = 0
    // above the drift-scoring speed (near a stop, full lock makes the CoM slip geometric)
    run(3, { brake: 1, steer: -1 }, (c) => {
      const t = c.telemetry()
      if (t.speed >= 8) maxSlip = Math.max(maxSlip, Math.abs(t.slipDeg))
    })
    expect(maxSlip).toBeLessThan(10)
  })

  it('slip never passes the anti-spin limit, even with drift held and opposite steer, brake or lifts', () => {
    const { car, run, launch } = carRig()
    launch(26)
    let maxSlip = 0
    const watch = (c: typeof car) => (maxSlip = Math.max(maxSlip, Math.abs(c.telemetry().slipDeg)))
    run(2, { throttle: 1, drift: 1, steer: -1 }, watch)
    run(1, { brake: 1, drift: 1, steer: -1 }, watch)
    run(0.5, { throttle: 1, drift: -1, steer: 1 }, watch) // flick to the other side
    run(1, { drift: -1, steer: 1 }, watch)
    expect(maxSlip).toBeLessThan(carConfig.drift.antiSpinDeg)
    expect(upright(car)).toBeGreaterThan(0.9)
  })

  it('a sideways kick without drift input is caught and straightened, not spun', () => {
    const { car, run, launch } = carRig()
    launch(22)
    // knock the car into a 35° slide (a rail hit / kerb): yaw it under its velocity
    car.body.setAngvel({ x: 0, y: -6, z: 0 }, true)
    let maxSlip = 0
    run(1.5, { throttle: 0.5 }, (c) => (maxSlip = Math.max(maxSlip, Math.abs(c.telemetry().slipDeg))))
    expect(maxSlip).toBeLessThan(carConfig.drift.antiSpinDeg)
    expect(Math.abs(car.telemetry().slipDeg)).toBeLessThan(5)
  })

  it('the drift axis does nothing at walking pace (no pirouettes on the spot)', () => {
    const { car, run } = carRig()
    run(0.5, {})
    run(1.5, { throttle: 0.3, drift: 1 })
    expect(car.driftMix).toBe(0)
    expect(Math.abs(car.telemetry().slipDeg)).toBeLessThan(5)
  })
})
