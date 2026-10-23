import { describe, expect, it } from 'vitest'
import { SIGN_LABELS, SIGN_RANGE, SIGN_SLOW, Signposts } from '../../src/world/signposts'
import { RoadNetwork } from '../../src/world/roadNetwork'

const roads = new RoadNetwork()
const signs = new Signposts(roads)
const near = (id: 'fork1' | 'fork2', dz = 10) => ({ x: roads.node(id).pos.x, y: 0, z: roads.node(id).pos.z + dz })

describe('Signposts', () => {
  it('each fork has its own three labels', () => {
    expect(SIGN_LABELS.fork1).toEqual(['SYSTEMS DROP', 'AUTOMATION PASS', 'PLATFORM RIDGE'])
    expect(new Set([...SIGN_LABELS.fork1, ...SIGN_LABELS.fork2]).size).toBe(6)
  })

  it('both placed signposts resolve to different forks', () => {
    const f1 = roads.edge('platform').points[3]
    const f2 = roads.edge('platform-w').points[2]
    expect(signs.forkAt(f1.x, f1.z)).toBe('fork1')
    expect(signs.forkAt(f2.x, f2.z)).toBe('fork2')
  })

  it('lights only when the car is near a fork and slower than 12 m/s', () => {
    expect(signs.litFor({ pos: near('fork1'), speed: SIGN_SLOW - 1 })).toBe('fork1')
    expect(signs.litFor({ pos: near('fork2'), speed: 3 })).toBe('fork2')
    expect(signs.litFor({ pos: near('fork1'), speed: SIGN_SLOW + 1 })).toBeNull()
    expect(signs.litFor({ pos: near('fork1', SIGN_RANGE + 5), speed: 2 })).toBeNull()
    expect(signs.litFor({ pos: near('fork1'), speed: Number.NaN })).toBeNull()
  })

  it('update tracks the lit fork', () => {
    const s = new Signposts(roads)
    s.update({ pos: near('fork1'), speed: 5 })
    expect(s.lit).toBe('fork1')
    s.update({ pos: near('fork1'), speed: 30 })
    expect(s.lit).toBeNull()
  })
})
