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
function wallRun(speed: number, wallFirst = true) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = PHYSICS_STEP
  world.createCollider(RAPIER.ColliderDesc.cuboid(4000, 0.5, 4000).setTranslation(0, -0.5, 0).setFriction(0.9))
  // creation order decides which collider Rapier reports as collider1
  const wall = () => world.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 0.6, 400).setTranslation(6, 0.6, 200).setFriction(0.4))
  if (wallFirst) wall()
  const yaw = 12 * (Math.PI / 180)
  const car = new DriftCar(world, { x: 0, y: 0, z: 0 }, yaw)
  if (!wallFirst) wall()
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
      if (car.grazeWall(e)) grazes++
    })
    minSpeed = Math.min(minSpeed, car.telemetry().speed)
  }
  return { car, grazes, minSpeed }
}

describe('wall graze (arcade guard rails)', () => {
  it.each([true, false])('a shallow rail hit at 28 m/s costs a modest chunk of speed and the car carries on along the wall (wall created first: %s)', (wallFirst) => {
    const { car, grazes, minSpeed } = wallRun(28, wallFirst)
    expect(grazes).toBeGreaterThan(0)
    expect(28 - minSpeed).toBeGreaterThan(2) // it is felt (~10–20 km/h)
    expect(28 - minSpeed).toBeLessThan(9)
    const v = car.body.linvel()
    expect(v.z).toBeGreaterThan(18) // still heading down the road
    expect(v.x).toBeLessThan(1) // no longer driving into the wall
    expect(car.body.translation().x).toBeLessThan(6)
  })

  /** Fake body with mutable velocities (the graze only reads and writes these). */
  const fakeBody = (lin: { x: number; y: number; z: number }, ang = { x: 0, y: 0, z: 0 }) => {
    const b = { lin, ang, linvel: () => b.lin, angvel: () => b.ang, setLinvel: (v: typeof lin) => (b.lin = v), setAngvel: (v: typeof ang) => (b.ang = v) }
    return b
  }
  // the wall is at +x in these cases, so its push on the car (outward) is -x
  const OUT = { x: -1, y: 0, z: 0 }

  it('a floor contact, or a car moving along or away from the wall, is not a graze', () => {
    const g = new WallGraze()
    expect(g.apply(fakeBody({ x: 3, y: 0, z: 10 }) as never, { x: 0, y: 1, z: 0 })).toBe(false) // floor
    expect(g.apply(fakeBody({ x: 0, y: 0, z: 10 }) as never, OUT)).toBe(false) // parallel
    // already leaving the wall (restitution bounce, tail clip mid-drift): untouched, no speed lost
    const away = fakeBody({ x: -3, y: 0, z: 20 })
    expect(g.apply(away as never, OUT)).toBe(false)
    expect(away.lin).toEqual({ x: -3, y: 0, z: 20 })
  })

  it('one graze per contact (cooldown), bounced off the wall, the yaw rate is calmed', () => {
    const g = new WallGraze()
    const b = fakeBody({ x: 5, y: 0, z: 20 }, { x: 0, y: 2, z: 0 })
    expect(g.apply(b as never, OUT)).toBe(true)
    expect(b.lin.x).toBeLessThan(0) // bounced off, away from the wall
    expect(b.lin.z).toBeGreaterThan(15) // carries on along it
    expect(b.ang.y).toBeCloseTo(1)
    b.lin = { x: 5, y: 0, z: 20 }
    expect(g.apply(b as never, OUT)).toBe(false)
    g.tick(0.5)
    expect(g.apply(b as never, OUT)).toBe(true)
  })
})
