import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { idleControls } from '../../src/core/input'
import { PHYSICS_STEP } from '../../src/core/loop'
import { DriftCar } from '../../src/vehicle/driftCar'
import { WallGraze } from '../../src/vehicle/wallGraze'

beforeAll(async () => {
  await RAPIER.init()
})

/** Flat slab with a long wall along z at x = `wallX`; the car at the origin heading 12° toward it at `speed`. */
function wallRun(speed: number, graze: boolean) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = PHYSICS_STEP
  world.createCollider(RAPIER.ColliderDesc.cuboid(4000, 0.5, 4000).setTranslation(0, -0.5, 0).setFriction(0.9))
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 0.6, 400).setTranslation(6, 0.6, 200).setFriction(0.4))
  const yaw = 12 * (Math.PI / 180)
  const car = new DriftCar(world, { x: 0, y: 0, z: 0 }, yaw)
  const events = new RAPIER.EventQueue(true)
  const c = { ...idleControls(), throttle: 0.4 }
  for (let i = 0; i < 30; i++) {
    car.update(idleControls(), PHYSICS_STEP)
    world.step()
  }
  car.body.setLinvel({ x: Math.sin(yaw) * speed, y: 0, z: Math.cos(yaw) * speed }, true)
  let grazes = 0
  let minSpeed = speed
  for (let i = 0; i < 150; i++) {
    car.update(c, PHYSICS_STEP)
    world.step(events)
    events.drainContactForceEvents((e) => {
      if (graze && car.grazeWall(e.maxForceDirection())) grazes++
    })
    minSpeed = Math.min(minSpeed, car.telemetry().speed)
  }
  return { car, grazes, minSpeed }
}

describe('wall graze (arcade guard rails)', () => {
  it('a shallow rail hit at 28 m/s costs a modest chunk of speed and the car carries on along the wall', () => {
    const { car, grazes, minSpeed } = wallRun(28, true)
    expect(grazes).toBeGreaterThan(0)
    expect(28 - minSpeed).toBeGreaterThan(2) // it is felt (~10–20 km/h)
    expect(28 - minSpeed).toBeLessThan(9)
    const v = car.body.linvel()
    expect(v.z).toBeGreaterThan(18) // still heading down the road
    expect(v.x).toBeLessThan(1) // no longer driving into the wall
    expect(car.body.translation().x).toBeLessThan(6)
  })

  it('a resting or floor contact is not a graze', () => {
    const g = new WallGraze()
    const body = { linvel: () => ({ x: 0, y: 0, z: 10 }), angvel: () => ({ x: 0, y: 0, z: 0 }), setLinvel: () => {}, setAngvel: () => {} }
    expect(g.apply(body as never, { x: 0, y: 1, z: 0 })).toBe(false) // floor
    expect(g.apply(body as never, { x: 1, y: 0, z: 0 })).toBe(false) // wall, but not moving into it
  })

  it('one graze per contact (cooldown), the yaw rate is calmed', () => {
    const g = new WallGraze()
    let lin = { x: 5, y: 0, z: 20 }
    let ang = { x: 0, y: 2, z: 0 }
    const body = { linvel: () => lin, angvel: () => ang, setLinvel: (v: typeof lin) => (lin = v), setAngvel: (v: typeof ang) => (ang = v) }
    expect(g.apply(body as never, { x: 1, y: 0, z: 0 })).toBe(true)
    expect(lin.x).toBeLessThan(0) // bounced off
    expect(ang.y).toBeCloseTo(1)
    lin = { x: 5, y: 0, z: 20 }
    expect(g.apply(body as never, { x: -1, y: 0, z: 0 })).toBe(false)
    g.tick(0.5)
    expect(g.apply(body as never, { x: -1, y: 0, z: 0 })).toBe(true)
  })
})
