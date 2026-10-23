import { describe, expect, it } from 'vitest'
import { toGround } from '../../src/core/math'
import { RacingLineDriver } from '../../src/game/racingLineDriver'
import { DESCENT_EDGES } from '../../src/world/roadLayout'
import { RoadNetwork } from '../../src/world/roadNetwork'

const roads = new RoadNetwork()
const driver = () => new RacingLineDriver(roads, DESCENT_EDGES.systems)

/** Car at the origin facing +Z (yaw 0) at `speed` m/s, gripping. */
const facingPlusZ = (speed: number) => ({
  pos: { x: 0, y: 0, z: 0 },
  heading: toGround({ x: 0, y: 0, z: 1 }),
  vel: { x: 0, y: 0, z: speed },
  speed,
  drifting: false,
})

describe('racing-line driver steering sign (forward +Z, left +X, steer +1 = right)', () => {
  it('steers left (negative) toward a target on the left (+X)', () => {
    expect(driver().steerToward(facingPlusZ(15), { x: 4, y: 0, z: 15 }, 15)).toBeLessThan(0)
  })

  it('steers right (positive) toward a target on the right (-X)', () => {
    expect(driver().steerToward(facingPlusZ(15), { x: -4, y: 0, z: 15 }, 15)).toBeGreaterThan(0)
  })

  it('holds straight for a target dead ahead and caps the input', () => {
    const d = driver()
    expect(Math.abs(d.steerToward(facingPlusZ(15), { x: 0, y: 0, z: 15 }, 15))).toBeLessThan(1e-9)
    expect(Math.abs(d.steerToward(facingPlusZ(30), { x: 50, y: 0, z: 1 }, 10))).toBeLessThanOrEqual(1)
  })

  it('works when stationary too (falls back to the nose direction)', () => {
    expect(driver().steerToward(facingPlusZ(0), { x: 4, y: 0, z: 10 }, 10)).toBeLessThan(0)
  })
})

describe('racing-line driver route and speed plan', () => {
  it('joins the Systems Drop edges into one route', () => {
    const d = driver()
    const sum = DESCENT_EDGES.systems.reduce((s, id) => s + roads.edge(id).length, 0)
    expect(d.length).toBeCloseTo(sum, 3)
    expect(d.start).toEqual(roads.edge('systems-a').points[0])
    expect(d.end).toEqual(roads.edge('systems-c').points.at(-1))
    expect(d.progress).toBe(0)
    expect(d.finished()).toBe(false)
  })

  it('plans a speed between walking pace and the cap, slower than the cap before the first hairpin', () => {
    const d = driver()
    const v = d.targetSpeed()
    expect(v).toBeGreaterThan(5)
    expect(v).toBeLessThanOrEqual(38)
    expect(new RacingLineDriver(roads, DESCENT_EDGES.systems, { maxSpeed: 10 }).targetSpeed()).toBeLessThanOrEqual(10)
  })

  it('launches from the start of the route on throttle, no brake or handbrake', () => {
    const d = driver()
    const p = roads.edge('systems-a').points[2]
    const tan = roads.edge('systems-a').tangent(2)
    const c = d.controls({
      pos: p,
      heading: toGround({ x: tan.x, y: 0, z: tan.y }),
      vel: { x: 0, y: 0, z: 0 },
      speed: 0,
      slipDeg: 0,
      drifting: false,
      wheelsOnGround: 4,
      onRoad: true,
      yaw: Math.atan2(tan.x, tan.y),
      throttle: 0,
    })
    expect(c.throttle).toBeGreaterThan(0.5)
    expect(c.brake).toBe(0)
    expect(c.handbrake).toBe(false)
    expect(Math.abs(c.steer)).toBeLessThan(0.5)
  })

  it('rejects an empty route', () => {
    expect(() => new RacingLineDriver(roads, [])).toThrow()
  })
})
