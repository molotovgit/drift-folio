import { describe, expect, it } from 'vitest'
import { lampSpots, treeKeepOut, treeSpots } from '../../src/world/mountainLayout'
import { GuardRails } from '../../src/world/guardRails'
import { RoadNetwork } from '../../src/world/roadNetwork'
import { TerrainHeights } from '../../src/world/terrain'

const roads = new RoadNetwork()
const terrain = new TerrainHeights(roads)

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

  it('every hairpin gets a rail on its outside edge', () => {
    for (const e of roads.edges) {
      if (e.route === 'town') continue
      const runs = GuardRails.findRuns(e)
      for (const i of e.hairpinApexes()) {
        const covered = runs.some((r) => r.from <= i && i <= r.to && r.side === (e.radius[i] > 0 ? -1 : 1))
        expect(covered, `${e.id}@${i}`).toBe(true)
      }
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
