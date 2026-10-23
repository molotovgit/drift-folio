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
  it('never rises through the asphalt anywhere across the road width (junctions included)', () => {
    let worst = -Infinity
    let where = ''
    for (const e of roads.edges) {
      for (let i = 0; i < e.points.length; i++) {
        const p = e.points[i]
        const t = e.tangent(i)
        for (const off of [-3.9, -2, 0, 2, 3.9]) {
          // left normal of the tangent: facing +Z, left is +X
          const x = p.x + t.y * off
          const z = p.z - t.x * off
          const above = terrain.heightAt(x, z) - (p.y - 0.02)
          if (above > worst) {
            worst = above
            where = `${e.id}@${i}${off}`
          }
        }
      }
    }
    expect(worst, where).toBeLessThan(0.05)
  })

  // generous limit: it is ~0.5 s on a desktop, but CI/loaded machines are slower
  it('builds in under 5 s', () => {
    const t0 = performance.now()
    new TerrainHeights(roads)
    expect(performance.now() - t0).toBeLessThan(5000)
  })

  it('sits flush under the centreline almost everywhere; never floats more than 2 m (retaining-wall spots)', () => {
    let samples = 0
    let flush = 0
    let worstFloat = 0
    for (const e of roads.edges) {
      for (let i = 0; i < e.points.length; i += 3) {
        const p = e.points[i]
        const gap = p.y - ROAD_LIFT - terrain.heightAt(p.x, p.z) // >0: road above ground
        samples++
        if (Math.abs(gap) < 0.35) flush++
        worstFloat = Math.max(worstFloat, gap)
      }
    }
    expect(flush / samples).toBeGreaterThan(0.97)
    expect(worstFloat).toBeLessThan(2)
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
