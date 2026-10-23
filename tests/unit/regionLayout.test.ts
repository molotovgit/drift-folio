import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { RoadProbe } from './support/roadProbe'

vi.mock('three/webgpu', () => import('three'))
vi.mock('../../src/render/toon', async () => {
  const T = await import('three')
  return { ToonMaterials: { create: () => new T.MeshBasicMaterial({ vertexColors: true }) } }
})
const { BIOMES } = await import('../../src/world/biomes')
const { CITY_FRONT, CityLayout, OVERPASS, PAVE_OUTER, PILLAR } = await import('../../src/world/cityLayout')
const { TerrainCollider } = await import('../../src/world/terrainCollider')
const { RegionLayouts } = await import('../../src/world/regionLayouts')
const { REGION_EDGE_DEFS, REGION_NODE_DEFS } = await import('../../src/world/regionLayout')
const { EDGE_DEFS, NODE_DEFS } = await import('../../src/world/roadLayout')
const { MOUNTAIN_FOREST_BOUNDS, treeKeepOut, treeSpots } = await import('../../src/world/mountainLayout')
const { RegionSurfaces } = await import('../../src/world/regionSurfaces')
const { RIVER_ROAD_CLEARANCE, valleyRiver, POND } = await import('../../src/world/riverLayout')
const { RoadNetwork } = await import('../../src/world/roadNetwork')
const { RoadSurface } = await import('../../src/world/roadSurface')
const { ROAD_CLEARANCE, RoadsideLayout } = await import('../../src/world/roadsideLayout')
const { allChannels } = await import('../../src/world/shortcutLayout')
const { TEMPLE, TEMPLE_LOTS, TEMPLE_ROAD_CLEARANCE, TEMPLE_TIERS } = await import('../../src/world/templeLayout')
const { TerrainHeights } = await import('../../src/world/terrain')
const { TOWN_LOTS } = await import('../../src/world/townLayout')
const { surfaceOf } = await import('../../src/vehicle/wheel')
const { leftOf } = await import('../../src/world/spline')
const { mulberry32 } = await import('../../src/world/dressing')

const roads = new RoadNetwork()
const terrain = new TerrainHeights(roads, [...TOWN_LOTS, ...TEMPLE_LOTS], allChannels(roads))
const regions = RegionLayouts.of(roads, terrain)
const { temple, city } = regions
const roadDist = (x: number, z: number) => roads.index.nearest(x, z, 80)?.dist ?? Infinity
const TIERS = ['high', 'mid', 'low'] as const

describe('region roads', () => {
  it('attach only to nodes no Systems Drop road touches (the ghost lap is pinned to those)', () => {
    const systemsNodes = new Set(roads.edges.filter((e) => e.route === 'systems' || e.route === 'systems-branch').flatMap((e) => [e.from, e.to]))
    const regionNodes = new Set(REGION_NODE_DEFS.map((n) => n.id))
    for (const d of REGION_EDGE_DEFS) for (const n of [d.from, d.to]) if (!regionNodes.has(n)) expect(systemsNodes.has(n), `${d.id} at ${n}`).toBe(false)
  })

  it('add 1.5–2.5 km of road, with at least one hairpin in each region, all reachable from the summit', () => {
    const edges = REGION_EDGE_DEFS.map((d) => roads.edge(d.id))
    const total = edges.reduce((s, e) => s + e.length, 0)
    expect(total).toBeGreaterThan(1500)
    expect(total).toBeLessThan(2500)
    for (const route of ['temple', 'city']) expect(edges.filter((e) => e.route === route).reduce((n, e) => n + e.hairpinApexes().length, 0), route).toBeGreaterThanOrEqual(1)
    const reach = roads.reachableFrom('summit')
    for (const n of REGION_NODE_DEFS) expect(reach.has(n.id), n.id).toBe(true)
  })

  it('keep well apart from every road they do not join (no overlapping asphalt or carve)', () => {
    for (const d of REGION_EDGE_DEFS) {
      const e = roads.edge(d.id)
      for (const o of roads.edges) {
        if (o === e || [o.from, o.to].some((n) => n === e.from || n === e.to)) continue
        for (const p of e.points) for (const q of o.points) expect(Math.hypot(p.x - q.x, p.z - q.z), `${e.id} vs ${o.id}`).toBeGreaterThan(40)
      }
    }
  })
})

describe('Lantern Valley layout', () => {
  it('has its landmarks: crest gate on the valley road, hall and pagoda on the courtyard, two torii tunnels, two bridges', () => {
    expect(temple.spots.gate).toHaveLength(1)
    expect(temple.spots.hall).toHaveLength(1)
    expect(temple.spots.pagoda).toHaveLength(1)
    expect(temple.spots.bridge).toHaveLength(2)
    expect(temple.spots.torii.length).toBeGreaterThanOrEqual(12)
    expect(temple.spots.lantern.length).toBeGreaterThanOrEqual(20)
    expect(temple.spots.paddy.length).toBeGreaterThanOrEqual(60)
    for (const k of ['hall', 'pagoda'] as const) {
      const s = temple.spots[k][0]
      expect(Math.hypot(s.x - TEMPLE.lot.x, s.z - TEMPLE.lot.z), k).toBeLessThan(TEMPLE.lot.r - 5)
      expect(terrain.heightAt(s.x, s.z), k).toBeCloseTo(TEMPLE.lot.y - 0.12, 1)
    }
  })

  it('nothing stands on the asphalt: every prop clears every road centreline (the gate straddles it on posts 6.8 m out)', () => {
    for (const [kind, spots] of Object.entries(temple.spots)) {
      if (kind === 'gate') continue
      for (const s of spots) expect(roadDist(s.x, s.z), `${kind} at ${s.x.toFixed(0)},${s.z.toFixed(0)}`).toBeGreaterThanOrEqual(TEMPLE_ROAD_CLEARANCE - 1e-9)
    }
    const g = temple.spots.gate[0]
    for (const s of [-1, 1]) expect(roadDist(g.x + Math.cos(g.yaw) * 6.8 * s, g.z - Math.sin(g.yaw) * 6.8 * s)).toBeGreaterThan(ROAD_CLEARANCE)
  })

  it('paddies stay level terraces beside the roads, clear of each other and of the river', () => {
    const river = valleyRiver()
    for (const p of temple.spots.paddy) {
      expect(BIOMES.weight('temple', p.x, p.z)).toBeGreaterThanOrEqual(0.7)
      // the water sheet is never below the ground at its centre (its skirt covers the slope below)
      expect(p.y).toBeGreaterThanOrEqual(terrain.heightAt(p.x, p.z))
      for (const q of river.points) expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeGreaterThan(river.width / 2 + 3)
    }
    const ps = temple.spots.paddy
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(Math.hypot(ps[i].x - ps[j].x, ps[i].z - ps[j].z)).toBeGreaterThan(7)
  })

  it('the river and pond stay clear of every road and run downhill', () => {
    const river = valleyRiver()
    for (const p of river.points) expect(roadDist(p.x, p.z)).toBeGreaterThan(RIVER_ROAD_CLEARANCE)
    expect(roadDist(POND.x, POND.z)).toBeGreaterThan(RIVER_ROAD_CLEARANCE)
    for (let i = 1; i < river.points.length; i++) expect(river.points[i].y).toBeLessThanOrEqual(river.points[i - 1].y + 1e-9)
    expect(POND.y).toBeLessThanOrEqual(river.points[river.points.length - 1].y)
  })

  it('every quality tier keeps a subset of the tier above (fixed rolls), the landmarks on every tier', () => {
    for (const kind of Object.keys(TEMPLE_TIERS) as (keyof typeof TEMPLE_TIERS)[]) {
      const [high, mid, low] = TIERS.map((t) => temple.forTier(kind, t))
      expect(mid.every((s) => high.includes(s)), kind).toBe(true)
      expect(low.every((s) => mid.includes(s)), kind).toBe(true)
      expect(high.length).toBe(temple.spots[kind].length)
    }
    for (const kind of ['gate', 'hall', 'pagoda', 'bridge'] as const) expect(temple.forTier(kind, 'low')).toHaveLength(temple.spots[kind].length)
    expect(temple.forTier('paddy', 'low').length).toBeLessThan(temple.spots.paddy.length * 0.8)
  })
})

describe('Neon Ward layout', () => {
  it('lines its streets with blocks, towers behind them, signs on the street blocks, the expressway on pillars', () => {
    expect(city.buildings.filter((b) => b.front).length).toBeGreaterThanOrEqual(30)
    expect(city.buildings.filter((b) => !b.front).length).toBeGreaterThanOrEqual(15)
    expect(city.signs.filter((s) => s.kind === 'band').length).toBe(city.buildings.filter((b) => b.front).length)
    expect(city.signs.filter((s) => s.kind === 'blade').length).toBeGreaterThan(10)
    expect(city.pillars.length).toBeGreaterThanOrEqual(8)
    for (const b of city.buildings) expect(BIOMES.weight('city', b.x, b.z)).toBeGreaterThanOrEqual(0.55)
  })

  it('no block stands on a street, in another block, or in the expressway corridor', () => {
    for (const b of city.buildings) {
      for (const c of [...CityLayout.corners(b.x, b.z, b.yaw, b.w, b.d), b]) expect(roadDist(c.x, c.z)).toBeGreaterThanOrEqual(CITY_FRONT - 0.5)
      const xs = CityLayout.corners(b.x, b.z, b.yaw, b.w, b.d).map((c) => c.x)
      expect(Math.max(...xs) <= OVERPASS.x - OVERPASS.width / 2 || Math.min(...xs) >= OVERPASS.x + OVERPASS.width / 2).toBe(true)
    }
    const bs = city.buildings
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(CityLayout.rectsOverlap(bs[i], bs[j]), `${i}/${j}`).toBe(false)
  })

  it('signs, vending machines and pillars stay off the asphalt; the deck clears the streets under it', () => {
    for (const s of city.signs) expect(roadDist(s.x, s.z)).toBeGreaterThan(ROAD_CLEARANCE)
    for (const v of city.vending) expect(roadDist(v.x, v.z)).toBeGreaterThan(ROAD_CLEARANCE + 3)
    for (const p of city.pillars) expect(roadDist(p.x, p.z)).toBeGreaterThanOrEqual(PAVE_OUTER + 1.5 + PILLAR.hz)
    for (let z = OVERPASS.z0; z <= OVERPASS.z1; z += 2) {
      const hit = roads.index.nearest(OVERPASS.x, z, 6)
      if (hit) expect(city.deckY - 1.3 - hit.point.y).toBeGreaterThan(7.5)
    }
  })

  it('the rectangle helpers agree with simple cases', () => {
    const a = { x: 0, z: 0, yaw: 0, w: 10, d: 10, h: 10, y: 0, tint: 0, front: true }
    expect(CityLayout.rectsOverlap(a, { ...a, x: 9 })).toBe(true)
    expect(CityLayout.rectsOverlap(a, { ...a, x: 11 })).toBe(false)
    expect(CityLayout.rectsOverlap(a, { ...a, x: 12, yaw: Math.PI / 4 })).toBe(true)
    expect(CityLayout.rectDiscDistance(a, { x: 8, z: 0, r: 1 })).toBeCloseTo(3)
    expect(CityLayout.rectDiscDistance({ ...a, yaw: Math.PI / 2 }, { x: 0, z: 2, r: 1 })).toBe(0)
  })

  it('vending machines thin per tier from fixed rolls', () => {
    const [high, mid, low] = TIERS.map((t) => city.vendingForTier(t))
    expect(mid.every((v) => high.includes(v))).toBe(true)
    expect(low.every((v) => mid.includes(v))).toBe(true)
    expect(low.length).toBeLessThan(high.length)
  })
})

describe('regions and the roadside plants', () => {
  const roadside = new RoadsideLayout(roads, terrain)
  const perMetre = (route: string) => {
    const len = roads.edges.filter((e) => e.route === route).reduce((s, e) => s + e.length, 0)
    const n = roadside.items.filter((it) => roads.index.nearest(it.x, it.z, 30)?.edge.route === route).length
    return n / len
  }

  it('plants keep out of the region props (blocks, paddies, temple, lanterns)', () => {
    const inside: string[] = []
    for (const it of roadside.items) {
      for (const k of regions.keepOuts) if ((it.x - k.x) ** 2 + (it.z - k.z) ** 2 < k.r * k.r) inside.push(`${it.kind} at ${it.x.toFixed(1)},${it.z.toFixed(1)}`)
    }
    expect(inside).toEqual([])
  })

  it('the ward is nearly bare, the valley trades susuki for ferns', () => {
    expect(perMetre('city')).toBeLessThan(perMetre('automation') * 0.25)
    const kindShare = (route: string, kind: string) => {
      const items = roadside.items.filter((it) => roads.index.nearest(it.x, it.z, 30)?.edge.route === route)
      return items.filter((it) => it.kind === kind).length / items.length
    }
    expect(kindShare('temple', 'pampas')).toBeLessThan(kindShare('automation', 'pampas'))
    expect(roadside.items.filter((it) => BIOMES.weight('city', it.x, it.z) > 0.9 && it.kind === 'fern')).toHaveLength(0)
  })

  it('the mountain forest stands where it always did: the regions only take trees away near themselves', () => {
    const regionDefs = new Set(REGION_EDGE_DEFS.map((d) => d.id))
    const regionNodes = new Set(REGION_NODE_DEFS.map((n) => n.id))
    const mountainOnly = new RoadNetwork(
      NODE_DEFS.filter((n) => !regionNodes.has(n.id)),
      EDGE_DEFS.filter((e) => !regionDefs.has(e.id)),
    )
    const m = MOUNTAIN_FOREST_BOUNDS
    const inSquare = (t: { x: number; z: number }) => t.x >= m.minX && t.x < m.minX + m.size && t.z >= m.minZ && t.z < m.minZ + m.size
    const key = (t: { model: string; x: number; z: number; yaw: number; scale: number }) => `${t.model}|${t.x}|${t.z}|${t.yaw}|${t.scale}`
    // the forest exactly as the mountain-only game planted it (147b681's treeSpots, replayed here): 5,043 trees
    const before: { model: string; x: number; z: number; yaw: number; scale: number }[] = []
    const rnd = mulberry32(2026)
    const keepOut = treeKeepOut(mountainOnly)
    for (let gz = m.minZ + 20; gz < m.minZ + m.size - 20; gz += 8.5) {
      for (let gx = m.minX + 20; gx < m.minX + m.size - 20; gx += 8.5) {
        const x = gx + (rnd() - 0.5) * 8.5 * 0.9
        const z = gz + (rnd() - 0.5) * 8.5 * 0.9
        const roll = rnd()
        const d = mountainOnly.index.nearest(x, z, 70)?.dist ?? 999
        if (d < 9 || keepOut.some((k) => Math.hypot(k.x - x, k.z - z) < k.r) || roll > (d < 30 ? 0.55 : d < 70 ? 0.35 : 0.12)) continue
        const maple = d < 45 ? rnd() < 0.75 : rnd() < 0.25
        const model = maple ? `tree_maple_${Math.floor(rnd() * 4)}` : `tree_pine_${Math.floor(rnd() * 3)}`
        before.push({ model, x, z, yaw: rnd() * Math.PI * 2, scale: 0.8 + rnd() * 0.5 })
      }
    }
    expect(before.length).toBe(5043)
    expect(before.every(inSquare)).toBe(true)
    const now = new Set(treeSpots(roads, terrain, treeKeepOut(roads), regions.keepOuts).map(key))
    const regionRoads = roads.edges.filter((e) => e.route === 'temple' || e.route === 'city')
    const nearRegion = (t: { x: number; z: number }) =>
      BIOMES.biomeAt(t.x, t.z).mountain < 1 || regionRoads.some((e) => e.points.some((p) => Math.hypot(p.x - t.x, p.z - t.z) < 12)) || regions.keepOuts.some((k) => Math.hypot(k.x - t.x, k.z - t.z) < k.r)
    const kept = before.filter((t) => !nearRegion(t))
    expect(kept.length).toBeGreaterThan(4500)
    expect(kept.filter((t) => !now.has(key(t)))).toEqual([])
  })

  it('is deterministic: a second plan of the same world is identical', () => {
    const again = RegionLayouts.of(roads, new TerrainHeights(roads, [...TOWN_LOTS, ...TEMPLE_LOTS], allChannels(roads)))
    expect(again).not.toBe(regions)
    expect(JSON.stringify(again.temple.spots)).toBe(JSON.stringify(temple.spots))
    expect(JSON.stringify(again.city.buildings)).toBe(JSON.stringify(city.buildings))
    expect(JSON.stringify(again.city.signs)).toBe(JSON.stringify(city.signs))
  })
})

describe('ward pavements', () => {
  let probe: InstanceType<typeof RoadProbe>
  beforeAll(async () => {
    await RAPIER.init()
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    // the terrain too, so a gap in the pavement would show as terrain (off-road), not as no hit
    new TerrainCollider(world, terrain)
    RoadSurface.colliders(roads, world)
    RegionSurfaces.pavementCollider(world, roads)
    probe = new RoadProbe(world, surfaceOf)
  })

  it('a slide from the asphalt onto the pavement meets no step over 2 cm and stays on a road-tagged surface', () => {
    let checked = 0
    for (const e of roads.edges.filter((r) => r.route === 'city')) {
      for (let i = 10; i < e.points.length - 10; i += 9) {
        for (const side of [1, -1] as const) {
          if (![i - 1, i, i + 1].every((k) => RegionSurfaces.paveable(roads, e, k, side))) continue
          // 0.7 m past the sample, so the probe never runs along a mesh row (a ray down a shared edge can slip through)
          const t = e.tangent(i)
          const p = { x: e.points[i].x + t.x * 0.7, y: e.points[i].y, z: e.points[i].z + t.y * 0.7 }
          const l = leftOf(t.x, t.y)
          const path = [0, 7.5].map((off) => ({ x: p.x + l.x * off * side, y: p.y + e.bank[i] * off * side, z: p.z + l.z * off * side }))
          const r = RoadProbe.bumps(probe.trace(path))
          expect(r.step, `${e.id}@${i} side ${side}`).toBeLessThan(0.02)
          expect(r.offRoad, `${e.id}@${i} side ${side}`).toBe(0)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(40)
  })
})
