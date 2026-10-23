import { describe, expect, it } from 'vitest'
import { CHECKPOINT_SPACING, Checkpoints, STUCK_SECONDS } from '../../src/world/checkpoints'
import { RoadNetwork } from '../../src/world/roadNetwork'

const roads = new RoadNetwork()
const start = { pos: { x: 0, y: 0, z: -22 }, yaw: 0, edgeId: 'summit' }
// ground far below every road so only the explicit fall test trips the fall rule
const make = (ground = -1000) => new Checkpoints(roads, () => ground, start)
const onRoad = (pos: { x: number; y: number; z: number }) => ({ pos, speed: 10, onRoad: true, wheelsOnGround: 4 })

describe('checkpoints (plan Task 3.4)', () => {
  it('places one every 50 m along every road', () => {
    const cp = make()
    const expected = roads.edges.reduce((n, e) => n + Math.ceil(e.length / CHECKPOINT_SPACING), 0)
    expect(cp.all.length).toBe(expected)
  })

  it('advances as the car drives past checkpoints on the road', () => {
    const cp = make()
    const target = cp.all.find((c) => c.edgeId === 'automation' && c.pos.z > 300)!
    cp.update(onRoad(target.pos), 1 / 60)
    expect(cp.last).toBe(target)
  })

  it('reports fell when the car is far below the ground', () => {
    const cp = make(0)
    expect(cp.update({ pos: { x: 0, y: -30, z: 0 }, speed: 3, onRoad: false, wheelsOnGround: 0 }, 1 / 60)).toBe('fell')
  })

  it('reports stuck after 4.0 s off-road below 0.5 m/s, not at 3.9 s', () => {
    const cp = make()
    const stuck = { pos: { x: 500, y: 0, z: 500 }, speed: 0.2, onRoad: false, wheelsOnGround: 4 }
    let result: string | null = null
    for (let t = 0; t < 3.9 - 1e-9; t += 0.1) result = cp.update(stuck, 0.1)
    expect(result).toBeNull()
    result = cp.update(stuck, 0.1)
    expect(result).toBe('stuck')
    expect(STUCK_SECONDS).toBe(4)
  })

  it('moving again clears the stuck timer', () => {
    const cp = make()
    const stuck = { pos: { x: 500, y: 0, z: 500 }, speed: 0.2, onRoad: false, wheelsOnGround: 4 }
    for (let i = 0; i < 30; i++) cp.update(stuck, 0.1)
    cp.update({ ...stuck, speed: 5 }, 0.1)
    for (let i = 0; i < 30; i++) expect(cp.update(stuck, 0.1)).toBeNull()
  })
})
