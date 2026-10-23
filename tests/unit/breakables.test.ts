import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', () => import('three'))
const { fenceSpots } = await import('../../src/world/breakables')
const { RoadNetwork } = await import('../../src/world/roadNetwork')

const roads = new RoadNetwork()

describe('fence placement (plan Task 7.10)', () => {
  it('places three runs of fence segments beside the Automation Pass, off the road', () => {
    const spots = fenceSpots(roads)
    expect(spots.length).toBe(24)
    for (const s of spots) {
      const hit = roads.index.nearest(s.pos.x, s.pos.z, 20)!
      expect(hit.dist).toBeGreaterThan(5)
      expect(hit.dist).toBeLessThan(8)
    }
  })
})
