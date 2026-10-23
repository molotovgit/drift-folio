import { describe, expect, it } from 'vitest'
import { RoadNetwork } from '../../src/world/roadNetwork'
import { ROAD_LIFT, TerrainHeights } from '../../src/world/terrain'
import { GARAGE, LANTERNS, LINK_PADS, TOWN_LOTS, TYRE_RACK } from '../../src/world/townLayout'

const roads = new RoadNetwork()
const terrain = new TerrainHeights(roads, TOWN_LOTS)

describe('base town layout (plan M6)', () => {
  it('flattens the ground under every lot to just below its paved top', () => {
    for (const l of TOWN_LOTS) {
      for (const [dx, dz] of [[0, 0], [l.r * 0.7, 0], [0, -l.r * 0.7], [-l.r * 0.5, l.r * 0.5]]) {
        expect(terrain.heightAt(l.x + dx, l.z + dz), l.name).toBeCloseTo(l.y - ROAD_LIFT, 0)
      }
    }
  })

  it('every lot touches a town road so you can drive onto it', () => {
    for (const l of TOWN_LOTS) {
      const hit = roads.index.nearest(l.x, l.z, l.r + 12)
      expect(hit, l.name).not.toBeNull()
    }
  })

  it('garage, tyre rack, pads and lanterns all sit on the plaza', () => {
    const plaza = TOWN_LOTS.find((l) => l.name === 'plaza')!
    const inside = (x: number, z: number) => Math.hypot(x - plaza.x, z - plaza.z) < plaza.r
    expect(inside(GARAGE.x, GARAGE.z)).toBe(true)
    expect(inside(TYRE_RACK.x, TYRE_RACK.z0)).toBe(true)
    expect(inside(LINK_PADS.x, LINK_PADS.z0)).toBe(true)
    for (const p of LANTERNS) expect(Math.hypot(p.x - plaza.x, p.z - plaza.z)).toBeLessThanOrEqual(plaza.r)
  })
})
