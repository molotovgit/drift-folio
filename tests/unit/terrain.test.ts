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
          // against the surface at that offset: near junctions the road is banked to the node plane
          const above = terrain.heightAt(x, z) - (e.surfaceY(i, off) - 0.02)
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
      [0.5, 50.5], [150.5, 300.5], [-200.5, 200.5], [300.5, 700.5], [-50.5, 820.5], [400.5, 0.5], [-600.5, 1000.5], [-450.5, 100.5], [450.5, 1100.5],
    ]
    for (const [x, z] of probes) {
      ray.origin = { x, y: 500, z }
      const hit = world.castRay(ray, 1000, true)
      expect(hit, `${x},${z}`).not.toBeNull()
      expect(500 - hit!.timeOfImpact).toBeCloseTo(terrain.heightAt(x, z), 0)
    }
  })

  it('vertical rays exactly on the height grid lines and vertices never slip through the heightfield', () => {
    // a ray straight down a Rapier heightfield cell line can miss (on the 1648 m field most lines
    // would); the collider sits GRID_NUDGE off the grid, so round world coordinates never hit a line
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    new TerrainCollider(world, terrain)
    world.step()
    const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
    const { minX, minZ, size } = terrain.bounds
    const cell = terrain.cellSize
    let misses = 0
    let rays = 0
    for (let i = 1; i < terrain.cells; i += 7) {
      for (let j = 1; j < terrain.cells; j += 7) {
        // a vertex, a point on an X line and one on a Z line
        for (const [fx, fz] of [[0, 0], [0, 0.5], [0.5, 0]]) {
          ray.origin = { x: minX + (i + fx) * cell, y: 500, z: minZ + (j + fz) * cell }
          rays++
          if (!world.castRay(ray, 1000, true)) misses++
        }
      }
    }
    expect(rays).toBeGreaterThan(9000)
    expect(misses).toBe(0)
    expect(size / terrain.cells).toBe(cell)
  })
})
