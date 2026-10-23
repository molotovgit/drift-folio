import { describe, expect, it } from 'vitest'
import { SIGN_LABELS, SIGN_RANGE, SIGN_SLOW, Signposts } from '../../src/world/signposts'
import { landmarks } from '../../src/world/mountainLayout'
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

  it('the four region signposts resolve to their own forks, stand off the asphalt and point each region out', () => {
    const terrain = { heightAt: () => 0 } as unknown as Parameters<typeof landmarks>[1]
    const posts = landmarks(roads, terrain).filter((l) => l.model === 'signpost')
    const forks = posts.map((p) => signs.forkAt(p.x, p.z))
    expect(forks).toEqual(['fork1', 'fork2', 'summit', 'townW', 'valleyGate', 'cityGate'])
    // (the four new ones: the fork1 post predates this check and stands 4.4 m from systems-a, inside the junction)
    for (const [k, p] of posts.entries()) if (k >= 2) expect(roads.index.nearest(p.x, p.z, 20)!.dist, forks[k]).toBeGreaterThan(5.4)
    expect(SIGN_LABELS.summit[0]).toBe('LANTERN VALLEY')
    expect(SIGN_LABELS.townW[0]).toBe('NEON WARD')
    // every fork's three boards say three different things
    for (const labels of Object.values(SIGN_LABELS)) expect(new Set(labels).size).toBe(3)
  })

  it('lights the region forks too', () => {
    const at = (id: 'summit' | 'townW' | 'valleyGate' | 'cityGate') => ({ x: roads.node(id).pos.x + 5, y: 0, z: roads.node(id).pos.z })
    for (const id of ['summit', 'townW', 'valleyGate', 'cityGate'] as const) expect(signs.litFor({ pos: at(id), speed: 3 })).toBe(id)
  })

  it('update tracks the lit fork', () => {
    const s = new Signposts(roads)
    s.update({ pos: near('fork1'), speed: 5 })
    expect(s.lit).toBe('fork1')
    s.update({ pos: near('fork1'), speed: 30 })
    expect(s.lit).toBeNull()
  })
})
