import { describe, expect, it } from 'vitest'
import { BIOMES, BIOME_REGIONS, BiomeMap, positionRoll } from '../../src/world/biomes'
import { RoadNetwork } from '../../src/world/roadNetwork'

const roads = new RoadNetwork()
const REGION_ROUTES = new Set(['temple', 'city'])

describe('biome map', () => {
  it('weights always sum to 1 and stay within 0..1', () => {
    for (let x = -760; x <= 870; x += 37) {
      for (let z = -290; z <= 1340; z += 41) {
        const w = BIOMES.biomeAt(x, z)
        expect(w.mountain + w.temple + w.city).toBeCloseTo(1, 9)
        for (const v of Object.values(w)) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('is pure mountain on the summit pad and in the base town, pure region deep inside each region', () => {
    expect(BIOMES.biomeAt(0, -30).mountain).toBe(1)
    expect(BIOMES.biomeAt(0, 884).mountain).toBe(1)
    expect(BIOMES.biomeAt(-470, 90).temple).toBe(1)
    expect(BIOMES.biomeAt(450, 1110).city).toBe(1)
    expect(BIOMES.dominant(-470, 90)).toBe('temple')
    expect(BIOMES.dominant(450, 1110)).toBe('city')
    expect(BIOMES.dominant(100, 400)).toBe('mountain')
  })

  it('blends smoothly across each border: no jump over 6 % per metre, and the full ramp is about the blend width', () => {
    for (const r of BIOME_REGIONS) {
      // walk from the outline's first vertex out along the line away from the region's centroid
      const cx = r.outline.reduce((s, p) => s + p[0], 0) / r.outline.length
      const cz = r.outline.reduce((s, p) => s + p[1], 0) / r.outline.length
      const [vx, vz] = r.outline[0]
      const len = Math.hypot(vx - cx, vz - cz)
      const ux = (vx - cx) / len
      const uz = (vz - cz) / len
      let prev = BIOMES.weight(r.biome, vx - ux * r.blend, vz - uz * r.blend)
      expect(prev).toBeGreaterThan(0.99)
      for (let s = -r.blend + 1; s <= r.blend; s += 1) {
        const w = BIOMES.weight(r.biome, vx + ux * s, vz + uz * s)
        expect(Math.abs(w - prev), `${r.biome} at ${s} m`).toBeLessThan(0.06)
        prev = w
      }
      expect(prev).toBe(0)
    }
  })

  it('leaves every mountain road untouched (pure mountain), and the region roads in their region past their entry', () => {
    for (const e of roads.edges) {
      if (REGION_ROUTES.has(e.route)) continue
      for (const p of e.points) expect(BIOMES.biomeAt(p.x, p.z).mountain, e.id).toBe(1)
    }
    for (const e of roads.edges.filter((r) => r.route === 'temple' && r.id !== 'valley-road')) {
      for (const p of e.points) expect(BIOMES.weight('temple', p.x, p.z), e.id).toBeGreaterThan(0.5)
    }
    for (const e of roads.edges.filter((r) => r.route === 'city' && r.id !== 'city-ramp')) {
      for (const p of e.points) expect(BIOMES.weight('city', p.x, p.z), e.id).toBeGreaterThan(0.5)
    }
  })

  it('is deterministic, and a map without regions is mountain everywhere', () => {
    const fresh = new BiomeMap()
    for (const [x, z] of [[-400, 50], [300, 1000], [-150, 0], [640, 1200]]) expect(fresh.biomeAt(x, z)).toEqual(BIOMES.biomeAt(x, z))
    expect(new BiomeMap([]).biomeAt(-470, 90)).toEqual({ mountain: 1, temple: 0, city: 0 })
  })

  it('position rolls are stable, in [0, 1) and differ by salt', () => {
    expect(positionRoll(12.3, -45.6)).toBe(positionRoll(12.3, -45.6))
    expect(positionRoll(12.3, -45.6, 1)).not.toBe(positionRoll(12.3, -45.6, 2))
    let sum = 0
    for (let i = 0; i < 2000; i++) {
      const r = positionRoll(i * 3.7, i * -1.3, 5)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThan(1)
      sum += r
    }
    expect(sum / 2000).toBeGreaterThan(0.45)
    expect(sum / 2000).toBeLessThan(0.55)
  })
})
