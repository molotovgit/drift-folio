import { describe, expect, it } from 'vitest'
import { projects, routeNames } from '../../src/content/projects'
import { BIOMES } from '../../src/world/biomes'
import { APEX_RADIUS, cornerSpots, placeName } from '../../src/world/cornerLayout'
import { leftOf } from '../../src/world/roadMesh'
import { RoadNetwork } from '../../src/world/roadNetwork'

const roads = new RoadNetwork()
const spots = cornerSpots(roads)

describe('project corners (plan Task 5.1/5.2)', () => {
  it('places all nine cards, three in each biome; the mountain ones on their own card route', () => {
    expect(spots.map((s) => s.id).sort()).toEqual(projects.map((p) => p.id).sort())
    const perBiome = { mountain: 0, temple: 0, city: 0 }
    for (const s of spots) {
      const biome = BIOMES.dominant(s.clip.x, s.clip.z)
      perBiome[biome]++
      const route = roads.edge(s.edgeId).route
      // region corners sit on their region's roads; mountain corners on the descent their card is filed under
      if (biome === 'temple') expect(route, s.id).toBe('temple')
      else if (biome === 'city') expect(route, s.id).toBe('city')
      else expect(route, s.id).toBe(projects.find((p) => p.id === s.id)!.route)
    }
    expect(perBiome).toEqual({ mountain: 3, temple: 3, city: 3 })
  })

  it('each card is labelled with the place it stands: its region, or its mountain route', () => {
    const names: Record<string, string> = { temple: 'Lantern Valley', city: 'Neon Ward' }
    for (const s of spots) {
      const route = roads.edge(s.edgeId).route
      const card = projects.find((p) => p.id === s.id)!
      expect(placeName(s.id), s.id).toBe(names[route] ?? routeNames[card.route])
    }
    expect(placeName('C2')).toBe('Neon Ward')
    expect(placeName('C5')).toBe('Lantern Valley')
    expect(placeName('C4')).toBe('Systems Drop')
  })

  it('every corner is clear of the other roads: its clip on its own road, its billboard off all asphalt', () => {
    for (const s of spots) {
      expect(roads.index.nearest(s.clip.x, s.clip.z, 10)!.edge.id, s.id).toBe(s.edgeId)
      expect(roads.index.nearest(s.board.x, s.board.z, 40)!.dist, s.id).toBeGreaterThan(8)
    }
  })

  it('each corner is a real bend (tighter than 80 m radius)', () => {
    for (const s of spots) expect(Math.abs(roads.edge(s.edgeId).radius[s.index]), s.id).toBeLessThan(80)
  })

  it('the clipping point is on the inside of the bend and within the trigger radius of the centreline', () => {
    for (const s of spots) {
      const e = roads.edge(s.edgeId)
      const p = e.points[s.index]
      const t = e.tangent(s.index)
      const l = leftOf(t.x, t.y)
      const side = Math.sign((s.clip.x - p.x) * l.x + (s.clip.z - p.z) * l.z)
      expect(side, s.id).toBe(s.turn)
      expect(Math.hypot(s.clip.x - p.x, s.clip.z - p.z)).toBeLessThan(APEX_RADIUS)
    }
  })

  it('billboards stand off the road, outside the bend, facing the approach', () => {
    for (const s of spots) {
      const hit = roads.index.nearest(s.board.x, s.board.z, 40)!
      expect(hit.dist, s.id).toBeGreaterThan(8)
      // panel front (+Z rotated by yaw) points back toward its own corner (switchbacks can put another road closer)
      const fx = Math.sin(s.boardYaw)
      const fz = Math.cos(s.boardYaw)
      const e = roads.edge(s.edgeId)
      const approach = e.points[Math.max(0, s.index - 20)]
      const toRoad = { x: approach.x - s.board.x, z: approach.z - s.board.z }
      const len = Math.hypot(toRoad.x, toRoad.z)
      expect((fx * toRoad.x + fz * toRoad.z) / len, s.id).toBeGreaterThan(0.95)
    }
  })

  it('corners are far enough apart that two cards never trigger together', () => {
    for (const a of spots) for (const b of spots) if (a !== b) expect(Math.hypot(a.clip.x - b.clip.x, a.clip.z - b.clip.z), `${a.id}-${b.id}`).toBeGreaterThan(APEX_RADIUS * 3)
  })
})
