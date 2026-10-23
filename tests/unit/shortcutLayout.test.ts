import { describe, expect, it } from 'vitest'
import { RoadNetwork } from '../../src/world/roadNetwork'
import { brokenRailChute, peakTrail, railBed, railCrossings, restStopCut, riverbed, type Channel } from '../../src/world/shortcutLayout'

const roads = new RoadNetwork()

/** Fraction of channel points (excluding the first/last 15 m) that come within `clear` m of a road. */
function encroach(c: Channel, clear: number): number {
  const inner = c.points.slice(4, -4)
  return inner.filter((p) => roads.index.nearest(p.x, p.z, clear) !== null).length / inner.length
}

const maxGrade = (c: Channel) => Math.max(...c.points.slice(1).map((p, i) => Math.abs(p.y - c.points[i].y) / Math.hypot(p.x - c.points[i].x, p.z - c.points[i].z)))

describe('shortcut layout (plan M7)', () => {
  it('the riverbed, chute, rest-stop cut and peak trail run clear of the roads between their ends', () => {
    for (const c of [riverbed(roads), brokenRailChute(roads), restStopCut(roads), peakTrail(roads)]) expect(encroach(c, 10), c.id).toBe(0)
  })

  it('dirt shortcuts are drivable (≤ 30 % grade)', () => {
    for (const c of [riverbed(roads), brokenRailChute(roads), peakTrail(roads)]) expect(maxGrade(c), c.id).toBeLessThan(0.3)
  })

  it('the riverbed and chute are shorter than the road they skip', () => {
    const len = (c: Channel) => c.points.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - c.points[i].x, p.z - c.points[i].z), 0)
    expect(len(riverbed(roads))).toBeLessThan(roads.edge('platform-down').length)
    // the cut skips a loop: shorter than the road between its ends
    const cut = restStopCut(roads)
    const a = roads.edge('automation')
    const idx = (p: { x: number; z: number }) => a.points.findIndex((q) => q.x === p.x && q.z === p.z)
    const roadBetween = a.dist[idx(cut.points[cut.points.length - 1])] - a.dist[idx(cut.points[0])]
    expect(len(cut)).toBeLessThan(roadBetween)
    // the chute reaches the cluster yard directly instead of via systems-a/b and the loop
    expect(len(brokenRailChute(roads))).toBeLessThan(roads.edge('systems-a').length)
  })

  it('the railway crosses all three descents at grade', () => {
    const crossed = new Set(railCrossings(roads).map((c) => roads.edge(c.edgeId).route))
    for (const r of ['automation', 'platform', 'systems']) expect(crossed.has(r as never), r).toBe(true)
    const bed = railBed(roads)
    for (const c of railCrossings(roads)) {
      const p = bed.points.reduce((best, q) => (Math.abs(q.x - c.x) < Math.abs(best.x - c.x) ? q : best))
      expect(p.y, c.edgeId).toBeCloseTo(c.y, 0)
    }
  })

  it('the railway grade stays gentle (≤ 8 %)', () => {
    expect(maxGrade(railBed(roads))).toBeLessThan(0.08)
  })
})
