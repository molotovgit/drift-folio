import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { RoadProbe, type BumpReport, type ProbePoint } from './support/roadProbe'

vi.mock('three/webgpu', () => import('three'))
const { leftOf } = await import('../../src/world/spline')
const { RoadSurface } = await import('../../src/world/roadSurface')
const { RoadNetwork } = await import('../../src/world/roadNetwork')
const { TerrainHeights } = await import('../../src/world/terrain')
const { TerrainCollider } = await import('../../src/world/terrainCollider')
const { TOWN_LOTS } = await import('../../src/world/townLayout')
const { allChannels, restStopCut } = await import('../../src/world/shortcutLayout')
const { PavedPath } = await import('../../src/world/pavedPath')
const { LotSurface } = await import('../../src/world/lotSurface')
const { surfaceOf } = await import('../../src/vehicle/wheel')
type RoadEdge = InstanceType<typeof RoadNetwork>['edges'][number]

/**
 * Road joins and bumps on the real mountain (owner play-test: "gaps at joins",
 * "the car jolts on invisible bumps"). A probe wheel rides every road, every
 * junction and the town lots through a Rapier world built from the real
 * colliders and reports vertical steps and grade kinks.
 */

const roads = new RoadNetwork()
const terrain = new TerrainHeights(roads, TOWN_LOTS, allChannels(roads))
let probe: RoadProbe

beforeAll(async () => {
  await RAPIER.init()
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  new TerrainCollider(world, terrain)
  RoadSurface.colliders(roads, world)
  LotSurface.colliders(
    world,
    TOWN_LOTS.map((l) => new LotSurface(l, roads)),
  )
  PavedPath.collider(world, restStopCut(roads), roads)
  probe = new RoadProbe(world, surfaceOf)
})

/** lateral wheel lines: both tyres of a car hugging either edge, and the middle */
const OFFSETS = [-3.2, -1.6, 0, 1.6, 3.2]
/** a tyre this far into a junction turn still sits on the asphalt */
const TURN_OFFSETS = [-2.4, -1.2, 0, 1.2, 2.4]

/** Samples i0..i1 of an edge (either direction) as probe points. */
function edgeCentre(e: RoadEdge, i0: number, i1: number): ProbePoint[] {
  const dir = i1 >= i0 ? 1 : -1
  const out: ProbePoint[] = []
  for (let i = i0; dir > 0 ? i <= i1 : i >= i1; i += dir) out.push({ ...e.points[i] })
  return out
}

/** A centre path shifted `off` metres to the left of travel (tangents from the path itself). */
function offsetPath(centre: ProbePoint[], off: number): ProbePoint[] {
  return centre.map((p, i) => {
    const a = centre[Math.max(0, i - 1)]
    const b = centre[Math.min(centre.length - 1, i + 1)]
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1
    const left = leftOf((b.x - a.x) / l, (b.z - a.z) / l)
    return { x: p.x + left.x * off, y: p.y, z: p.z + left.z * off }
  })
}

/** Index of the sample `s` metres from the node end of an edge. */
const at = (e: RoadEdge, atStart: boolean, s: number) => {
  const n = e.points.length - 1
  const k = Math.min(n, Math.round(s / 2))
  return atStart ? k : n - k
}

/**
 * Every way through every node a car can take (turn < 100°): approach on one
 * road, a smooth quadratic turn through the node, leave on the other.
 */
function junctionRuns(reach = 26, turnIn = 10): { name: string; centre: ProbePoint[] }[] {
  const out: { name: string; centre: ProbePoint[] }[] = []
  for (const n of roads.nodes) {
    const frame = roads.junction(n.id)
    const ends = roads.edges.flatMap((e) => [...(e.from === n.id ? [{ e, atStart: true }] : []), ...(e.to === n.id ? [{ e, atStart: false }] : [])])
    for (const a of ends) {
      for (const b of ends) {
        if (a === b) continue
        const pa = a.e.points[at(a.e, a.atStart, turnIn)]
        const pb = b.e.points[at(b.e, b.atStart, turnIn)]
        const ua = { x: pa.x - n.pos.x, z: pa.z - n.pos.z }
        const ub = { x: pb.x - n.pos.x, z: pb.z - n.pos.z }
        const cos = (ua.x * ub.x + ua.z * ub.z) / Math.hypot(ua.x, ua.z) / Math.hypot(ub.x, ub.z)
        if (cos > Math.cos((80 * Math.PI) / 180)) continue // sharper than a 100° turn
        const turn: ProbePoint[] = []
        for (let k = 1; k < 40; k++) {
          const t = k / 40
          const x = (1 - t) ** 2 * pa.x + 2 * (1 - t) * t * n.pos.x + t * t * pb.x
          const z = (1 - t) ** 2 * pa.z + 2 * (1 - t) * t * n.pos.z + t * t * pb.z
          turn.push({ x, y: frame.heightAt(x, z), z })
        }
        out.push({
          name: `${n.id}: ${a.e.id} -> ${b.e.id}`,
          centre: [...edgeCentre(a.e, at(a.e, a.atStart, reach), at(a.e, a.atStart, turnIn)), ...turn, ...edgeCentre(b.e, at(b.e, b.atStart, turnIn), at(b.e, b.atStart, reach))],
        })
      }
    }
  }
  return out
}

/** Worst report over several wheel lines. */
function worst(reports: BumpReport[]): BumpReport {
  return {
    step: Math.max(...reports.map((r) => r.step)),
    kink: Math.max(...reports.map((r) => r.kink)),
    offRoad: Math.max(...reports.map((r) => r.offRoad)),
    at: reports.reduce((a, b) => (b.step > a.step ? b : a)).at,
  }
}

const fmt = (r: BumpReport) => `step ${(r.step * 100).toFixed(1)} cm, kink ${(r.kink * 100).toFixed(1)} %, off-road ${r.offRoad}`

describe('road joins and bumps on the real mountain', () => {
  it('every way through every junction is seamless: no step over 2 cm, no grade kink over 6 %, never off the asphalt', () => {
    const bad: string[] = []
    for (const run of junctionRuns()) {
      const r = worst(TURN_OFFSETS.map((off) => RoadProbe.bumps(probe.trace(offsetPath(run.centre, off)))))
      if (r.step > 0.02 || r.kink > 0.06 || r.offRoad > 0) bad.push(`${run.name}: ${fmt(r)}`)
    }
    expect(bad).toEqual([])
  })

  it('driving any road end to end, edge to edge: no step over 2 cm, no grade kink over 6 %', () => {
    const bad: string[] = []
    for (const e of roads.edges) {
      const centre = edgeCentre(e, 0, e.points.length - 1)
      const r = worst(OFFSETS.map((off) => RoadProbe.bumps(probe.trace(offsetPath(centre, off)))))
      if (r.step > 0.02 || r.kink > 0.06 || r.offRoad > 0) bad.push(`${e.id}: ${fmt(r)} @ ${(r.at * 0.25).toFixed(0)} m`)
    }
    expect(bad).toEqual([])
  })

  it('every node is covered by asphalt across the full road width (no wedge gaps between ribbon ends)', () => {
    for (const n of roads.nodes) {
      let miss = 0
      const r = roads.edges[0].width / 2 - 0.1
      for (let dx = -r; dx <= r; dx += 0.37) {
        for (let dz = -r; dz <= r; dz += 0.37) {
          if (Math.hypot(dx, dz) <= r && probe.sample(n.pos.x + dx, n.pos.y, n.pos.z + dz).tag !== 'road') miss++
        }
      }
      expect(miss, n.id).toBe(0)
    }
  })

  it('the terrain stays under the asphalt, and never rises over its edge within a 1 m shoulder', () => {
    const worst = { road: -Infinity, shoulder: -Infinity, roadAt: '', shoulderAt: '' }
    for (const e of roads.edges) {
      const half = e.width / 2
      for (let i = 0; i < e.points.length; i++) {
        const p = e.points[i]
        const l = leftOf(e.tangent(i).x, e.tangent(i).y)
        for (const off of [-half - 1, -half - 0.5, -half, -2, 0, 2, half, half + 0.5, half + 1]) {
          const x = p.x + l.x * off
          const z = p.z + l.z * off
          // on the asphalt: against the surface there; on the shoulder: against the road edge's height
          const shoulder = Math.abs(off) > half
          const above = terrain.heightAt(x, z) - e.surfaceNear(i, x, z, half)
          const key = shoulder ? 'shoulder' : 'road'
          if (above > worst[key]) {
            worst[key] = above
            worst[shoulder ? 'shoulderAt' : 'roadAt'] = `${e.id}@${i} offset ${off}`
          }
        }
      }
    }
    expect(worst.road, worst.roadAt).toBeLessThan(-0.05)
    expect(worst.shoulder, worst.shoulderAt).toBeLessThan(0.02)
  })

  it('rolling between a town lot and the street it touches never meets a step', () => {
    const bad: string[] = []
    for (const lot of TOWN_LOTS) {
      // (offset by 1.3° so no spoke runs exactly along a mesh edge, where a ray can slip between triangles)
      for (let a = 1.3; a < 360; a += 3) {
        const c = Math.cos((a * Math.PI) / 180)
        const s = Math.sin((a * Math.PI) / 180)
        // a spoke from inside the lot out to the centreline of a street that starts within ~6 m of the rim
        // (further out, leaving the lot is ordinary off-road driving)
        const point = (k: number) => ({ x: lot.x + c * lot.r * k, y: lot.y, z: lot.z + s * lot.r * k })
        const far = 1 + 10 / lot.r
        let end = 0.5
        while (end < far && !roads.index.nearest(point(end).x, point(end).z, 1)) end += 0.01
        if (end >= far) continue
        const r = RoadProbe.bumps(probe.trace([point(0.5), point(end)]))
        if (r.step > 0.02) bad.push(`${lot.name} spoke ${a}°: ${fmt(r)}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('the paved rest-stop cut (S4) meets Automation Pass without a step', () => {
    const cut = restStopCut(roads)
    const centre = cut.points.map((p) => ({ ...p }))
    const r = worst([-2.5, 0, 2.5].map((off) => RoadProbe.bumps(probe.trace(offsetPath(centre, off)))))
    expect(r.step, fmt(r)).toBeLessThan(0.02)
  })
})
