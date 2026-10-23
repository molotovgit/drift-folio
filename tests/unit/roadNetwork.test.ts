import { describe, expect, it } from 'vitest'
import { RoadNetwork } from '../../src/world/roadNetwork'

const net = new RoadNetwork()

describe('road network (plan Task 3.1)', () => {
  it('summit is at 0 m and the town about -120 m', () => {
    expect(net.node('summit').pos.y).toBe(0)
    for (const id of ['townA', 'townP', 'townS', 'townW']) expect(net.node(id).pos.y).toBeCloseTo(-117, -1)
  })

  it('each of the three descents is 600–1000 m', () => {
    for (const r of ['automation', 'platform', 'systems'] as const) {
      const len = net.descentLength(r)
      expect(len, r).toBeGreaterThanOrEqual(600)
      expect(len, r).toBeLessThanOrEqual(1000)
    }
  })

  it('every road is reachable from the summit and the summit is reachable again (return road)', () => {
    const fromSummit = net.reachableFrom('summit')
    for (const n of net.nodes) expect(fromSummit.has(n.id), n.id).toBe(true)
    expect(net.reachableFrom('townW').has('summit')).toBe(true)
  })

  it('Fork 2 splits the Platform Ridge and both branches rejoin', () => {
    const fromFork2 = net.edges.filter((e) => e.from === 'fork2' && e.route === 'platform')
    expect(fromFork2.length).toBe(2)
    expect(fromFork2.every((e) => e.to === 'join2')).toBe(true)
  })

  it('no road is steeper than 14 %', () => {
    for (const e of net.edges) expect(e.maxGrade(), e.id).toBeLessThanOrEqual(0.14)
  })

  it('Systems Drop has the hairpins; Automation Pass has none', () => {
    const sysHairpins = ['systems-a', 'systems-b', 'systems-c'].reduce((n, id) => n + net.edge(id).hairpinApexes().length, 0)
    expect(sysHairpins).toBeGreaterThanOrEqual(3)
    expect(net.edge('automation').hairpinApexes().length).toBe(0)
  })

  it('hairpins are not tighter than 9 m radius (drivable sideways)', () => {
    for (const e of net.edges) expect(Math.min(...e.radius.map(Math.abs)), e.id).toBeGreaterThanOrEqual(9)
  })

  it('finds the nearest road and reports the edge', () => {
    const p = net.edge('automation').points[100]
    const hit = net.index.nearest(p.x + 2, p.z)
    expect(hit?.edge.id).toBe('automation')
    expect(hit!.dist).toBeLessThan(2.5)
    expect(net.index.nearest(5000, 5000)).toBeNull()
  })
})
