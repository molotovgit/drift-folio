import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', () => import('three'))
const { RoadMesh } = await import('../../src/world/roadMesh')
const { RoadNetwork } = await import('../../src/world/roadNetwork')

const roads = new RoadNetwork()

describe('road ribbons at junctions', () => {
  it('roads sharing a node get distinct ranks there, so their overlaps are never coplanar', () => {
    const ranks = RoadMesh.junctionRanks(roads)
    for (const n of roads.nodes) {
      const here = roads.edges.flatMap((e) => [...(e.from === n.id ? [ranks.get(e.id)!.from] : []), ...(e.to === n.id ? [ranks.get(e.id)!.to] : [])])
      expect(new Set(here).size, n.id).toBe(here.length)
    }
  })

  it('the lift fades out away from the junctions and the collider surface is untouched', () => {
    const e = roads.edge('automation')
    const { positions } = RoadMesh.ribbon(e)
    const lifted = RoadMesh.liftNearJunctions(positions, e, { from: 2, to: 1 })
    const mid = Math.floor(e.points.length / 2)
    expect(lifted[mid * 6 + 1]).toBeCloseTo(positions[mid * 6 + 1], 6)
    expect(lifted[1] - positions[1]).toBeGreaterThan(0.03)
    // vertex 0 is the left edge, on the (junction-banked) surface
    expect(positions[1]).toBeCloseTo(e.surfaceY(0, e.width / 2), 5)
  })
})
