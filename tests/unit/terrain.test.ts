import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { RoadNetwork } from '../../src/world/roadNetwork'
import { ROAD_LIFT, TerrainHeights } from '../../src/world/terrain'
import { TerrainCollider } from '../../src/world/terrainCollider'

const roads = new RoadNetwork()
const terrain = new TerrainHeights(roads)

beforeAll(async () => {
  await RAPIER.init()
})

describe('terrain heights (plan Task 3.2)', () => {
  it('is carved flat under every road (within 0.35 m of the asphalt)', () => {
    let worst = 0
    for (const e of roads.edges) {
      for (let i = 0; i < e.points.length; i += 3) {
        const p = e.points[i]
        worst = Math.max(worst, Math.abs(terrain.heightAt(p.x, p.z) + ROAD_LIFT - p.y))
      }
    }
    expect(worst).toBeLessThan(0.35)
  })

  it('has no NaN and stays in a sane range', () => {
    let lo = Infinity
    let hi = -Infinity
    for (const h of terrain.heights) {
      expect(Number.isFinite(h)).toBe(true)
      lo = Math.min(lo, h)
      hi = Math.max(hi, h)
    }
    expect(lo).toBeGreaterThan(-260)
    expect(hi).toBeLessThan(140)
  })

  it('the Rapier heightfield matches heightAt', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    new TerrainCollider(world, terrain)
    world.step() // rapier indexes new colliders for queries on step
    const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
    const probes = [
      [0, 50], [150, 300], [-200, 200], [300, 700], [-50, 820], [400, 0], [-600, 1000],
    ]
    for (const [x, z] of probes) {
      ray.origin = { x, y: 500, z }
      const hit = world.castRay(ray, 1000, true)
      expect(hit, `${x},${z}`).not.toBeNull()
      expect(500 - hit!.timeOfImpact).toBeCloseTo(terrain.heightAt(x, z), 0)
    }
  })
})
