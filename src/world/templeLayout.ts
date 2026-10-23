import type { QualityTier } from '../render/post'
import { BIOMES } from './biomes'
import { mulberry32, type Placement } from './dressing'
import { leftOf } from './roadMesh'
import { SAMPLE_SPACING } from './roadLayout'
import type { RoadEdge } from './roadNetwork'
import { valleyRiver } from './riverLayout'
import type { SiteChecker } from './siteChecker'
import type { FlatLot } from './townLayout'

/** Lantern Valley's prop kinds (each one instanced set). */
export type TempleKind = 'gate' | 'hall' | 'pagoda' | 'lantern' | 'torii' | 'paddy' | 'grove' | 'bridge'

/** One placed prop: position (base on the ground), facing, size and its tier-thinning roll. */
export interface PropSpot {
  x: number
  y: number
  z: number
  yaw: number
  scale: number
  keep: number
}

/** Fraction of each kind kept per quality tier (low ⊂ mid ⊂ high: rolls are fixed per prop). */
export const TEMPLE_TIERS: Readonly<Record<TempleKind, Readonly<Record<QualityTier, number>>>> = {
  gate: { high: 1, mid: 1, low: 1 },
  hall: { high: 1, mid: 1, low: 1 },
  pagoda: { high: 1, mid: 1, low: 1 },
  bridge: { high: 1, mid: 1, low: 1 },
  lantern: { high: 1, mid: 0.7, low: 0.4 },
  torii: { high: 1, mid: 0.8, low: 0.5 },
  paddy: { high: 1, mid: 0.85, low: 0.6 },
  grove: { high: 1, mid: 0.7, low: 0.4 },
}

/** The temple compound: hall and pagoda on a flattened courtyard south-west of the temple node. */
export const TEMPLE = {
  hall: { x: -600, z: 206 },
  pagoda: { x: -563, z: 234 },
  /** the courtyard the terrain is flattened under (just above the temple node's road height) */
  lot: { name: 'temple', x: -585, z: 216, r: 36, y: -37 } satisfies FlatLot,
}
export const TEMPLE_LOTS: readonly FlatLot[] = [TEMPLE.lot]

/** Paddy terrace footprint (along the road × across it), metres; rows of terraces beside the roads. */
export const PADDY = { along: 9, across: 7, step: 10, rows: [15, 24.5, 34], maxRise: 2 }
/** Stone lanterns line the valley roads this far apart and this far out from the centreline. */
const LANTERN_EVERY = 22
const LANTERN_OFFSET = 6.3
/** the torii tunnel's gates stand this far apart */
const TORII_SPACING = 3.2
/** clearance every valley prop keeps from any road centreline (beyond the asphalt and rails) */
export const TEMPLE_ROAD_CLEARANCE = 5.6
/** valley props only where the valley biome holds at least this weight */
const MIN_WEIGHT = 0.55

/**
 * Where Lantern Valley's props go: the crest gate over the valley road, the
 * temple hall and pagoda, torii tunnels up to the hall and up the hillside
 * outside the far hairpin, stone lanterns along the roads, terraced rice
 * paddies stepping down beside them, bamboo groves and footbridges over the
 * river. Pure and seeded; every prop is checked clear of the asphalt, the
 * river and the props placed before it (SiteChecker).
 */
export class TempleLayout {
  readonly spots: Record<TempleKind, PropSpot[]> = { gate: [], hall: [], pagoda: [], lantern: [], torii: [], paddy: [], grove: [], bridge: [] }
  /** glTF landmarks (the hillside shrine at the top of the torii tunnel) */
  readonly landmarks: Placement[] = []
  private readonly rnd = mulberry32(5150)
  private readonly edges: RoadEdge[]

  constructor(private readonly site: SiteChecker) {
    this.edges = site.roads.edges.filter((e) => e.route === 'temple')
    this.crestGate()
    this.compound()
    this.toriiTunnels()
    // the rest of the courtyard stays open (the approach tunnel runs across it)
    site.claim({ x: TEMPLE.lot.x, z: TEMPLE.lot.z, r: TEMPLE.lot.r })
    this.lanterns()
    this.bridges()
    this.paddies()
    this.groves()
  }

  /** The spots a quality tier draws for one kind. */
  forTier(kind: TempleKind, tier: QualityTier): PropSpot[] {
    return this.spots[kind].filter((s) => s.keep < TEMPLE_TIERS[kind][tier])
  }

  /** Index of the sample `d` metres along an edge (clamped to the edge). */
  static sampleAt(e: RoadEdge, d: number): number {
    return Math.min(e.points.length - 1, Math.max(0, Math.round(d / SAMPLE_SPACING)))
  }

  private push(kind: TempleKind, x: number, z: number, yaw: number, y = this.site.terrain.heightAt(x, z), scale = 1): void {
    this.spots[kind].push({ x, y, z, yaw, scale, keep: this.rnd() })
  }

  /** A two-roofed gate straddling the valley road at the crest (posts 6.8 m either side, clear of the rails). */
  private crestGate(): void {
    const e = this.site.roads.edge('valley-road')
    const i = e.points.length - 1
    const p = e.points[i]
    const t = e.tangent(i)
    this.push('gate', p.x, p.z, Math.atan2(t.x, t.y), p.y - 0.05)
    const l = leftOf(t.x, t.y)
    for (const s of [1, -1]) this.site.claim({ x: p.x + l.x * 6.8 * s, z: p.z + l.z * 6.8 * s, r: 1.5 })
  }

  /** Hall and pagoda on the courtyard, both facing the temple node (model front is +Z). */
  private compound(): void {
    const node = this.site.roads.node('valleyTemple').pos
    for (const [kind, at, r] of [['hall', TEMPLE.hall, 12], ['pagoda', TEMPLE.pagoda, 5.5]] as const) {
      this.push(kind, at.x, at.z, Math.atan2(node.x - at.x, node.z - at.z), TEMPLE.lot.y)
      this.site.claim({ x: at.x, z: at.z, r })
    }
  }

  /**
   * Two torii tunnels: one from beside the temple node up to the hall's front
   * steps, one climbing the hillside outside the hairpin road's far apex to a
   * small shrine.
   */
  private toriiTunnels(): void {
    const node = this.site.roads.node('valleyTemple').pos
    const hall = TEMPLE.hall
    const dx = hall.x - node.x
    const dz = hall.z - node.z
    const len = Math.hypot(dx, dz)
    this.tunnel(node.x, node.z, dx / len, dz / len, 12, len - 14)
    // the far hairpin: the apex furthest west, tunnel outward (away from the bend's centre)
    const e = this.site.roads.edge('valley-hairpin')
    const apex = e.hairpinApexes().reduce((a, b) => (e.points[b].x < e.points[a].x ? b : a))
    const p = e.points[apex]
    const t = e.tangent(apex)
    const l = leftOf(t.x, t.y)
    const out = Math.sign(e.radius[apex]) > 0 ? -1 : 1
    const end = this.tunnel(p.x, p.z, l.x * out, l.z * out, 9, 40)
    if (end) this.landmarks.push({ model: 'shrine', x: end.x, z: end.z, y: this.site.terrain.heightAt(end.x, end.z), yaw: Math.atan2(-l.x * out, -l.z * out) })
  }

  /** Gates along a straight path from (x, z) in direction (ux, uz), `from`..`to` metres out. Returns the spot past the last gate. */
  private tunnel(x: number, z: number, ux: number, uz: number, from: number, to: number): { x: number; z: number } | null {
    let last: { x: number; z: number } | null = null
    const first = this.spots.torii.length
    for (let s = from; s <= to; s += TORII_SPACING) {
      const gx = x + ux * s
      const gz = z + uz * s
      if (!this.site.free(gx, gz, 1.6, TEMPLE_ROAD_CLEARANCE + 1.5)) continue
      this.push('torii', gx, gz, Math.atan2(ux, uz))
      last = { x: gx + ux * 4, z: gz + uz * 4 }
    }
    // claim the path once it is laid (gates are 3.2 m apart; their discs would block each other)
    for (const g of this.spots.torii.slice(first)) this.site.claim({ x: g.x, z: g.z, r: 1.7 })
    if (last) this.site.claim({ x: last.x, z: last.z, r: 3 })
    return last
  }

  /** Stone lanterns every LANTERN_EVERY metres, alternating sides, wherever the valley holds. */
  private lanterns(): void {
    for (const e of this.edges) {
      for (let d = LANTERN_EVERY / 2, k = 0; d < e.length; d += LANTERN_EVERY, k++) {
        const i = TempleLayout.sampleAt(e, d)
        const p = e.points[i]
        const t = e.tangent(i)
        const l = leftOf(t.x, t.y)
        const side = k % 2 ? 1 : -1
        const x = p.x + l.x * LANTERN_OFFSET * side
        const z = p.z + l.z * LANTERN_OFFSET * side
        if (BIOMES.weight('temple', x, z) < MIN_WEIGHT || !this.site.free(x, z, 0.8, TEMPLE_ROAD_CLEARANCE)) continue
        // face the road
        this.push('lantern', x, z, Math.atan2(-l.x * side, -l.z * side), Math.min(p.y, this.site.terrain.heightAt(x, z)))
        this.site.claim({ x, z, r: 1 })
      }
    }
  }

  /** Two arched footbridges across the river, a third and two thirds of the way down. */
  private bridges(): void {
    const river = valleyRiver().points
    for (const f of [0.33, 0.7]) {
      const i = Math.round(f * (river.length - 1))
      const a = river[Math.max(0, i - 1)]
      const b = river[Math.min(river.length - 1, i + 1)]
      const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1
      // the deck (model +Z) spans across the stream
      const nx = -(b.z - a.z) / tl
      const nz = (b.x - a.x) / tl
      const p = river[i]
      const bank = Math.max(this.site.terrain.heightAt(p.x + nx * 5, p.z + nz * 5), this.site.terrain.heightAt(p.x - nx * 5, p.z - nz * 5))
      this.push('bridge', p.x, p.z, Math.atan2(nx, nz), bank - 0.15)
      this.site.claim({ x: p.x, z: p.z, r: 5.5 })
    }
  }

  /**
   * Rice terraces: rows of flat paddies parallel to each valley road, each one
   * level (its water at the highest ground under it), so on a slope they step
   * down like terraces. Skipped where the ground under one rises more than
   * PADDY.maxRise (its skirt would show) or anything is in the way.
   */
  private paddies(): void {
    const half = { a: PADDY.along / 2, c: PADDY.across / 2 }
    const r = Math.hypot(half.a, half.c)
    for (const e of this.edges) {
      for (let d = PADDY.step; d < e.length - PADDY.step; d += PADDY.step) {
        const i = TempleLayout.sampleAt(e, d)
        const p = e.points[i]
        const t = e.tangent(i)
        const l = leftOf(t.x, t.y)
        for (const side of [1, -1]) {
          for (const off of PADDY.rows) {
            const x = p.x + l.x * off * side
            const z = p.z + l.z * off * side
            if (BIOMES.weight('temple', x, z) < 0.7 || !this.site.free(x, z, r - 1, off - half.c - 1)) continue
            // every corner clear of the roads too, and the ground under it gentle enough
            const corners = [-1, 1].flatMap((sa) => [-1, 1].map((sc) => ({ x: x + t.x * half.a * sa + l.x * half.c * sc, z: z + t.y * half.a * sa + l.z * half.c * sc })))
            if (corners.some((c) => this.site.roadDistance(c.x, c.z, 20) < TEMPLE_ROAD_CLEARANCE + 2)) continue
            const ys = [{ x, z }, ...corners].map((c) => this.site.terrain.heightAt(c.x, c.z))
            const top = Math.max(...ys)
            if (top - Math.min(...ys) > PADDY.maxRise) continue
            this.push('paddy', x, z, Math.atan2(t.x, t.y), top + 0.06)
            this.site.claim({ x, z, r: r - 0.8 })
          }
        }
      }
    }
  }

  /** Bamboo groves in clumps behind the paddies and lanterns, where a coarse noise patch says so. */
  private groves(): void {
    for (const e of this.edges) {
      for (let d = 7; d < e.length; d += 14) {
        const i = TempleLayout.sampleAt(e, d)
        const p = e.points[i]
        const t = e.tangent(i)
        const l = leftOf(t.x, t.y)
        for (const side of [1, -1]) {
          const off = 16 + this.rnd() * 22
          const roll = this.rnd()
          const cx = p.x + l.x * off * side
          const cz = p.z + l.z * off * side
          if (roll > 0.45 || BIOMES.weight('temple', cx, cz) < MIN_WEIGHT) continue
          for (let k = 0; k < 4; k++) {
            const a = this.rnd() * Math.PI * 2
            const rr = k === 0 ? 0 : 3 + this.rnd() * 3
            const x = cx + Math.cos(a) * rr
            const z = cz + Math.sin(a) * rr
            const yaw = this.rnd() * Math.PI * 2
            const scale = 0.85 + this.rnd() * 0.35
            if (!this.site.free(x, z, 1.4, 10)) continue
            this.push('grove', x, z, yaw, this.site.terrain.heightAt(x, z) - 0.1, scale)
            this.site.claim({ x, z, r: 1.6 })
          }
        }
      }
    }
  }
}
