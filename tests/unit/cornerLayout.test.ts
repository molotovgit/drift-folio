import { describe, expect, it } from 'vitest'
import { projects } from '../../src/content/projects'
import { APEX_RADIUS, cornerSpots } from '../../src/world/cornerLayout'
import { leftOf } from '../../src/world/roadMesh'
import { RoadNetwork } from '../../src/world/roadNetwork'

const roads = new RoadNetwork()
const spots = cornerSpots(roads)

describe('project corners (plan Task 5.1/5.2)', () => {
  it('places all nine cards, each on a route matching its card', () => {
    expect(spots.map((s) => s.id).sort()).toEqual(projects.map((p) => p.id).sort())
    const routeOf = (edgeId: string) => roads.edge(edgeId).route
    for (const s of spots) {
      const card = projects.find((p) => p.id === s.id)!
      const route = routeOf(s.edgeId)
      expect(route === card.route || (card.route === 'systems-branch' && route === 'systems-branch'), s.id).toBe(true)
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
