import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { idleControls, type ControlState } from '../../src/core/input'
import { PHYSICS_STEP } from '../../src/core/loop'
import { createDriftCar, type DriftCar } from '../../src/vehicle/driftCar'

beforeAll(async () => {
  await RAPIER.init()
})

function rig() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = PHYSICS_STEP
  world.createCollider(RAPIER.ColliderDesc.cuboid(2000, 0.5, 2000).setTranslation(0, -0.5, 0).setFriction(0.9))
  const car = createDriftCar(world, { x: 0, y: 0, z: 0 }, 0)
  const run = (seconds: number, c: Partial<ControlState>, sample?: (car: DriftCar) => void) => {
    const ctrl = { ...idleControls(), ...c }
    for (let i = 0; i < Math.round(seconds / PHYSICS_STEP); i++) {
      car.update(ctrl, PHYSICS_STEP)
      world.step()
      sample?.(car)
    }
  }
  return { world, car, run }
}

const upright = (car: DriftCar) => {
  const q = car.body.rotation()
  // y component of the local up vector
  return 1 - 2 * (q.x * q.x + q.z * q.z)
}

describe('FD drift handling (headless physics)', () => {
  it('settles on its suspension at rest', () => {
    const { car, run } = rig()
    run(2, {})
    const t = car.telemetry()
    expect(t.wheelsOnGround).toBe(4)
    expect(t.pos.y).toBeGreaterThan(0.3)
    expect(t.pos.y).toBeLessThan(0.7)
    expect(t.speed).toBeLessThan(0.1)
  })

  it('accelerates past 15 m/s in 3 s and tops out at a sane speed', () => {
    const { car, run } = rig()
    run(0.5, {})
    run(3, { throttle: 1 })
    expect(car.telemetry().speed).toBeGreaterThan(15)
    run(20, { throttle: 1 })
    const top = car.telemetry().speed
    expect(top).toBeGreaterThan(45)
    expect(top).toBeLessThan(80)
  })

  it('handbrake + steer at speed starts a drift', () => {
    const { run } = rig()
    run(0.5, {})
    run(4, { throttle: 1 })
    let drifted = false
    run(1.5, { throttle: 1, steer: 1, handbrake: true }, (c) => (drifted ||= c.telemetry().drifting))
    expect(drifted).toBe(true)
  })

  it('a drift can be held on throttle with counter-steer for at least 2 s', () => {
    const { car, run } = rig()
    run(0.5, {})
    run(4, { throttle: 1 })
    run(0.6, { throttle: 1, steer: 1, handbrake: true })
    let held = 0
    run(3, { throttle: 0.85, steer: 0 }, (c) => {
      if (c.telemetry().drifting) held += PHYSICS_STEP
    })
    expect(held).toBeGreaterThan(2)
    expect(upright(car)).toBeGreaterThan(0.9)
  })

  it('straightens out when inputs are released', () => {
    const { car, run } = rig()
    run(0.5, {})
    run(4, { throttle: 1 })
    run(1.0, { throttle: 1, steer: 1, handbrake: true })
    run(4, {})
    expect(Math.abs(car.telemetry().slipDeg)).toBeLessThan(5)
    expect(upright(car)).toBeGreaterThan(0.95)
  })

  it('brakes to a stop and reverses', () => {
    const { car, run } = rig()
    run(0.5, {})
    run(3, { throttle: 1 })
    run(5, { brake: 1 })
    const t = car.telemetry()
    const fwd = { x: Math.sin(t.yaw), z: Math.cos(t.yaw) }
    expect(t.vel.x * fwd.x + t.vel.z * fwd.z).toBeLessThan(-1)
  })

  it('never produces NaN under random inputs', () => {
    const { car, run } = rig()
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 40; i++) {
      run(0.25, { throttle: rnd(), brake: rnd() < 0.2 ? 1 : 0, steer: rnd() * 2 - 1, handbrake: rnd() < 0.3, clutch: rnd() < 0.2 })
    }
    const t = car.telemetry()
    for (const v of [t.pos.x, t.pos.y, t.pos.z, t.speed, t.slipDeg]) expect(Number.isFinite(v)).toBe(true)
  })

  it('full throttle with light steer grips instead of sliding (traction control)', () => {
    const { run } = rig()
    run(0.5, {})
    run(2, { throttle: 1 })
    let maxSlip = 0
    run(3, { throttle: 1, steer: 0.3 }, (c) => (maxSlip = Math.max(maxSlip, Math.abs(c.telemetry().slipDeg))))
    expect(maxSlip).toBeLessThan(12)
  })

  it('a clutch kick under throttle and steer breaks traction into a drift', () => {
    const { run } = rig()
    run(0.5, {})
    run(3, { throttle: 1 })
    let drifted = false
    run(0.1, { throttle: 1, steer: 1, clutch: true })
    run(1.5, { throttle: 1, steer: 1 }, (c) => (drifted ||= c.telemetry().drifting))
    expect(drifted).toBe(true)
  })

  it('pose(alpha) blends between the last two ticks', () => {
    const { car, run } = rig()
    run(0.5, {})
    run(2, { throttle: 1 })
    const a = car.pose(0)
    const b = car.pose(1)
    const mid = car.pose(0.5)
    expect(mid.pos.z).toBeCloseTo((a.pos.z + b.pos.z) / 2, 5)
    expect(b.pos.z).toBeGreaterThan(a.pos.z)
  })

  it('reset clears motion and lands on four wheels', () => {
    const { car, run } = rig()
    run(0.5, {})
    run(3, { throttle: 1, steer: 1, handbrake: true })
    car.resetTo({ x: 10, y: 0, z: 10 }, 1)
    run(1.5, {})
    const t = car.telemetry()
    expect(t.wheelsOnGround).toBe(4)
    expect(t.speed).toBeLessThan(0.2)
    expect(t.yaw).toBeCloseTo(1, 1)
  })
})
