import { describe, expect, it } from 'vitest'
import { lampSpots, treeKeepOut, treeSpots } from '../../src/world/mountainLayout'
import { GuardRails } from '../../src/world/guardRails'
import { leftOf } from '../../src/world/roadMesh'
import { RoadNetwork, type RoadEdge } from '../../src/world/roadNetwork'
import { TerrainHeights } from '../../src/world/terrain'

const roads = new RoadNetwork()
const terrain = new TerrainHeights(roads)

/** +1 if the road bends toward the driver's left around sample i, -1 if right — from tangents only. */
function turnSide(e: RoadEdge, i: number): 1 | -1 {
  const a = e.tangent(Math.max(0, i - 6))
  const b = e.tangent(Math.min(e.points.length - 1, i + 6))
  const l = leftOf(a.x, a.y)
  return l.x * b.x + l.z * b.y > 0 ? 1 : -1
}

describe('mountain layout (plan Tasks 3.3, 3.5)', () => {
  it('every hairpin has a lamp outside its apex', () => {
    const lamps = lampSpots(roads)
    for (const e of roads.edges) {
      for (const i of e.hairpinApexes()) {
        const apex = e.points[i]
        const near = lamps.filter((l) => l.hairpin && Math.hypot(l.pos.x - apex.x, l.pos.z - apex.z) < 8)
        expect(near.length, `${e.id}@${i}`).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('lamps stand beside the road, not on it', () => {
    for (const l of lampSpots(roads)) {
      const hit = roads.index.nearest(l.pos.x, l.pos.z, 20)
      expect(hit!.dist, l.edgeId).toBeGreaterThan(4.5)
    }
  })

  it('every hairpin gets a rail on its OUTSIDE edge (checked geometrically)', () => {
    for (const e of roads.edges) {
      if (e.route === 'town') continue
      const runs = GuardRails.findRuns(e)
      for (const i of e.hairpinApexes()) {
        const outside = -turnSide(e, i)
        const covered = runs.some((r) => r.from <= i && i <= r.to && r.side === outside)
        expect(covered, `${e.id}@${i}`).toBe(true)
      }
    }
  })

  it('hairpin lamps stand on the outside of the bend', () => {
    for (const lamp of lampSpots(roads).filter((l) => l.hairpin)) {
      const e = roads.edge(lamp.edgeId)
      const hit = roads.index.nearest(lamp.pos.x, lamp.pos.z, 12)!
      const i = hit.index
      const t = e.tangent(i)
      const l = leftOf(t.x, t.y)
      const sideOfLamp = Math.sign((lamp.pos.x - e.points[i].x) * l.x + (lamp.pos.z - e.points[i].z) * l.z)
      expect(sideOfLamp, `${lamp.edgeId}`).toBe(-turnSide(e, i))
    }
  })

  it('no tree within 4 m of any road centreline, none in the keep-out areas', () => {
    const keepOut = treeKeepOut(roads)
    const trees = treeSpots(roads, terrain, keepOut)
    expect(trees.length).toBeGreaterThan(1500)
    for (const t of trees) {
      const hit = roads.index.nearest(t.x, t.z, 4)
      expect(hit).toBeNull()
      expect(keepOut.some((k) => Math.hypot(k.x - t.x, k.z - t.z) < k.r)).toBe(false)
    }
  })

  it('trees are deterministic', () => {
    const a = treeSpots(roads, terrain, treeKeepOut(roads))
    const b = treeSpots(roads, terrain, treeKeepOut(roads))
    expect(a.length).toBe(b.length)
    expect(a[100]).toEqual(b[100])
  })
})
