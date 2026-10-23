import { describe, expect, it } from 'vitest'
import { MAX_CROSS, MAX_GRADE } from '../../src/world/junctionPlane'
import { LotSurface } from '../../src/world/lotSurface'
import { NodeFrame } from '../../src/world/roadJunctions'
import { RoadNetwork } from '../../src/world/roadNetwork'
import { RoadProfile } from '../../src/world/roadProfile'
import { BOWLING, capsuleDistance, GARAGE, GYMKHANA, LINK_PADS, lot, TOWN_LOTS, TYRE_RACK } from '../../src/world/townLayout'

/**
 * Junction planes must not reshape the roads around them: every road keeps
 * close to its own grade, nothing leans more than MAX_CROSS, town streets stay
 * gentle, and the town lots stay flat where they are used.
 */

const roads = new RoadNetwork()
/** grade a road would have on its own: straight from node to node */
const natural = (id: string) => {
  const e = roads.edge(id)
  return Math.abs(roads.node(e.to).pos.y - roads.node(e.from).pos.y) / e.length
}
const pct = (v: number) => `${(v * 100).toFixed(1)} %`

describe('road grades and camber around junctions', () => {
  it('every road stays within 2.6 % of its own grade, and within the 14 % budget', () => {
    for (const e of roads.edges) {
      const msg = `${e.id}: ${pct(natural(e.id))} → ${pct(e.maxGrade())}`
      expect(e.maxGrade(), msg).toBeLessThanOrEqual(natural(e.id) + 0.026)
      expect(e.maxGrade(), msg).toBeLessThanOrEqual(MAX_GRADE + 1e-3)
    }
  })

  it('town streets stay within 1.5 % of their own (near-flat) grade', () => {
    for (const e of roads.edges.filter((e) => e.route === 'town')) {
      expect(e.maxGrade(), `${e.id}: ${pct(natural(e.id))} → ${pct(e.maxGrade())}`).toBeLessThanOrEqual(natural(e.id) + 0.015)
    }
  })

  it(`no road leans sideways more than ${pct(MAX_CROSS)} anywhere`, () => {
    for (const e of roads.edges) expect(Math.max(...e.bank.map(Math.abs)), e.id).toBeLessThanOrEqual(MAX_CROSS + 1e-3)
  })

  it('a node with a town street has a near-flat plane (gentlest street + 2.5 %)', () => {
    for (const n of roads.nodes) {
      const town = roads.edges.filter((e) => e.route === 'town' && (e.from === n.id || e.to === n.id))
      if (!town.length) continue
      const g = roads.junction(n.id).grad
      expect(Math.hypot(g.x, g.y), n.id).toBeLessThanOrEqual(Math.min(...town.map((e) => natural(e.id))) + 0.025 + 1e-3)
    }
  })

  it('a road too short for both holds still blends: holds shrink, heights stay finite and land on both nodes', () => {
    const flat = Array.from({ length: 11 }, (_, i) => ({ x: 0, y: i * 2 }))
    const line = { flat, dist: flat.map((p) => p.y), length: 20 }
    const tangents = flat.map(() => ({ x: 0, y: 1 }))
    const a = new NodeFrame('a', { x: 0, y: 0, z: 0 }, { x: 0, y: 0.05 }, new Map())
    const b = new NodeFrame('b', { x: 0, y: 1, z: 20 }, { x: 0, y: 0.05 }, new Map())
    const p = new RoadProfile(line, tangents, { frame: a, hold: 15 }, { frame: b, hold: 15 })
    expect(p.y.every(Number.isFinite)).toBe(true)
    expect(p.y[0]).toBe(0)
    expect(p.y[10]).toBe(1)
    // the start still lies on its plane, now over a shortened hold
    expect(p.y[2]).toBeCloseTo(0.2, 6)
  })
})

describe('town lots', () => {
  it('each lot is dead flat (< 5 mm) over its usable area, ramps to the streets only outside it', () => {
    for (const l of TOWN_LOTS) {
      const s = LotSurface.of(l, roads)
      let worst = 0
      for (let x = l.x - l.r; x <= l.x + l.r; x += 0.5) {
        for (let z = l.z - l.r; z <= l.z + l.r; z += 0.5) {
          if (capsuleDistance(l.usable!, x, z) > 0) continue
          worst = Math.max(worst, Math.abs(s.heightAt(x, z) - l.y))
        }
      }
      expect(worst, l.name).toBeLessThan(0.005)
    }
  })

  it('the skidpad ring with room to drift around it, and the whole cone course, lie in the usable areas', () => {
    const skid = lot('skidpad')
    // the painted ring: radius 300/1024 of the texture across the 2r disc
    expect(capsuleDistance(skid.usable!, skid.x + (300 / 512) * skid.r + 4, skid.z)).toBe(0)
    const gym = lot('gymkhana').usable!
    for (const [x, z] of GYMKHANA.cones) expect(capsuleDistance(gym, x, z)).toBe(0)
    for (const g of [GYMKHANA.start, GYMKHANA.finish]) {
      expect(capsuleDistance(gym, g.x, g.z - GYMKHANA.gateRadius)).toBe(0)
      expect(capsuleDistance(gym, g.x, g.z + GYMKHANA.gateRadius)).toBe(0)
    }
    const plaza = LotSurface.of(lot('plaza'), roads)
    const props: [number, number][] = [[GARAGE.x, GARAGE.z], [BOWLING.x, BOWLING.z], [TYRE_RACK.x, TYRE_RACK.z0], [LINK_PADS.x, LINK_PADS.z0]]
    for (const [x, z] of props) expect(plaza.heightAt(x, z)).toBeCloseTo(lot('plaza').y, 3)
  })

  it('lot surfaces are shared, built once, and stay light (≤ 4k vertices each)', () => {
    for (const l of TOWN_LOTS) {
      const s = LotSurface.of(l, roads)
      expect(LotSurface.of(l, roads)).toBe(s)
      expect(s.geometry()).toBe(s.geometry())
      expect(s.geometry().positions.length / 3, l.name).toBeLessThanOrEqual(4000)
    }
  })
})
