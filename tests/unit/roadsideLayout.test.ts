import { describe, expect, it } from 'vitest'
import { fenceSpots } from '../../src/world/breakables'
import { lampSpots, landmarks } from '../../src/world/mountainLayout'
import { RoadNetwork } from '../../src/world/roadNetwork'
import { CHANNEL_MARGIN, LANDMARK_CLEARANCE, LOT_MARGIN, ROAD_CLEARANCE, ROADSIDE_KINDS, RoadsideLayout, type RoadsideKind } from '../../src/world/roadsideLayout'
import { allChannels, channelDistance, PEAK } from '../../src/world/shortcutLayout'
import { TerrainHeights } from '../../src/world/terrain'
import { TOWN_LOTS } from '../../src/world/townLayout'

const roads = new RoadNetwork()
const terrain = new TerrainHeights(roads)
const layout = new RoadsideLayout(roads, terrain)
const all = [...layout.items, ...layout.trees]

const countBy = (items: readonly { kind: RoadsideKind }[]) =>
  Object.fromEntries((Object.keys(ROADSIDE_KINDS) as RoadsideKind[]).map((k) => [k, items.filter((i) => i.kind === k).length]))

describe('roadside layout', () => {
  it('places every kind, densest near the asphalt', () => {
    const n = countBy(layout.items)
    for (const k of Object.keys(ROADSIDE_KINDS)) expect(n[k], k).toBeGreaterThan(0)
    expect(n.grass).toBeGreaterThan(n.bush)
    expect(n.bush).toBeGreaterThan(n.rock)
    expect(layout.trees.length).toBeGreaterThan(50)
  })

  it('never puts anything on the asphalt, the shoulder or the rails of ANY road', () => {
    for (const it of all) {
      const hit = roads.index.nearest(it.x, it.z, 20)
      if (hit) expect(hit.dist, `${'kind' in it ? it.kind : it.model} at ${it.x.toFixed(1)},${it.z.toFixed(1)}`).toBeGreaterThanOrEqual(ROAD_CLEARANCE)
    }
  })

  it('respects each kind’s distance band (tall things stay further back)', () => {
    for (const it of layout.items) {
      const hit = roads.index.nearest(it.x, it.z, 40)
      if (hit) expect(hit.dist, it.kind).toBeGreaterThanOrEqual(ROADSIDE_KINDS[it.kind].band[0] - 0.6)
    }
    for (const t of layout.trees) expect(roads.index.nearest(t.x, t.z, 20)?.dist ?? 99).toBeGreaterThanOrEqual(10.5)
  })

  it('keeps the full margin from town lots, the peak, shortcut channels and the railway bed', () => {
    const channels = allChannels(roads)
    for (const it of all) {
      for (const l of [...TOWN_LOTS, PEAK]) expect(Math.hypot(it.x - l.x, it.z - l.z)).toBeGreaterThanOrEqual(l.r + LOT_MARGIN - 1e-9)
      for (const c of channels) expect(channelDistance(c, it.x, it.z).dist, c.id).toBeGreaterThanOrEqual(c.width / 2 + CHANNEL_MARGIN - 1e-9)
    }
  })

  it('clears each landmark by its own footprint', () => {
    for (const l of landmarks(roads, terrain)) {
      const r = LANDMARK_CLEARANCE[l.model]
      expect(r, l.model).toBeGreaterThan(0)
      for (const it of all) expect(Math.hypot(it.x - l.x, it.z - l.z), l.model).toBeGreaterThanOrEqual(r - 1e-9)
    }
  })

  it('does not stand on lamps or breakable fences', () => {
    const props = [...lampSpots(roads).map((l) => l.pos), ...fenceSpots(roads).map((f) => f.pos)]
    for (const it of all) for (const p of props) expect(Math.hypot(it.x - p.x, it.z - p.z)).toBeGreaterThan(1.5)
  })

  it('only small plants grow beside the town streets', () => {
    for (const it of layout.items) {
      const hit = roads.index.nearest(it.x, it.z, 16)
      if (hit?.edge.route === 'town') expect(ROADSIDE_KINDS[it.kind].town, it.kind).toBe(true)
    }
  })

  it('sits on the ground', () => {
    for (const it of layout.items) expect(Math.abs(it.y - terrain.heightAt(it.x, it.z))).toBeLessThan(0.1)
  })

  it('is deterministic (identical items and trees every build)', () => {
    const again = new RoadsideLayout(roads, terrain)
    expect(again.items).toEqual(layout.items)
    expect(again.trees).toEqual(layout.trees)
  })

  it('thins deterministically by quality tier: low ⊂ mid ⊂ high', () => {
    const high = layout.forTier('high')
    const mid = layout.forTier('mid')
    const low = layout.forTier('low')
    expect(high.length).toBe(layout.items.length)
    expect(mid.length).toBeLessThan(high.length)
    expect(low.length).toBeLessThan(mid.length)
    const midSet = new Set(mid)
    for (const it of low) expect(midSet.has(it)).toBe(true)
    // the structure (bamboo groves, jizo) survives on every tier
    expect(countBy(low).jizo).toBe(countBy(high).jizo)
  })
})
