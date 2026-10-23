import type { QualityTier } from '../render/post'
import { fenceSpots } from './breakables'
import { cornerSpots } from './cornerLayout'
import { mulberry32 } from './dressing'
import { lampSpots, landmarks, treeKeepOut, type TreeSpot } from './mountainLayout'
import { leftOf } from './roadMesh'
import type { RoadEdge, RoadNetwork } from './roadNetwork'
import { allChannels, channelDistance, PEAK, type Channel } from './shortcutLayout'
import { ValueNoise, type TerrainHeights } from './terrain'
import { TOWN_LOTS } from './townLayout'

/** The roadside layers, nearest the asphalt first. */
export type RoadsideKind = 'grass' | 'flowers' | 'pampas' | 'fern' | 'bush' | 'rock' | 'bamboo' | 'jizo'

/** How one kind is scattered along the roads. */
export interface KindRule {
  /** distance band from the road centreline, metres */
  band: readonly [number, number]
  /** expected placements per 10 m of road, per side (before patch and keep-out rejection) */
  per10m: number
  /** only where value noise at this scale (m) exceeds `threshold`: patches, stretches, groves */
  patch?: { scale: number; threshold: number }
  /** each accepted spot spawns this many plants within `spread` metres (a clump) */
  cluster?: { count: number; spread: number }
  /** uniform scale range */
  scale: readonly [number, number]
  /** fraction kept per quality tier (deterministic thinning: low keeps a subset of high) */
  tier: Readonly<Record<QualityTier, number>>
  /** allowed beside the town streets too (only small plants are) */
  town?: boolean
}

/**
 * The roadside recipe in one table. Each row is one instanced mesh (one draw
 * plus its ink outline) — delete a row, or lower its `per10m`, to shrink the
 * budget. Bands start past the guard rails (rail face at 4.7 m) and the 8 m
 * asphalt, so nothing ever stands on the drivable width.
 */
export const ROADSIDE_KINDS: Readonly<Record<RoadsideKind, KindRule>> = {
  grass: { band: [5.6, 11], per10m: 14, scale: [0.7, 1.35], tier: { high: 1, mid: 0.7, low: 0.4 }, town: true },
  flowers: { band: [5.8, 8.5], per10m: 3, patch: { scale: 38, threshold: 0.55 }, scale: [0.8, 1.2], tier: { high: 1, mid: 0.7, low: 0.4 }, town: true },
  pampas: { band: [6, 11], per10m: 2.2, patch: { scale: 60, threshold: 0.45 }, scale: [0.75, 1.25], tier: { high: 1, mid: 0.8, low: 0.5 } },
  fern: { band: [6.5, 13], per10m: 2.5, patch: { scale: 45, threshold: 0.4 }, scale: [0.8, 1.4], tier: { high: 1, mid: 0.7, low: 0.45 } },
  bush: { band: [7, 15], per10m: 2, scale: [0.7, 1.5], tier: { high: 1, mid: 0.85, low: 0.6 } },
  rock: { band: [7.5, 24], per10m: 0.45, scale: [0.25, 0.8], tier: { high: 1, mid: 1, low: 0.7 } },
  bamboo: { band: [11, 22], per10m: 0.5, patch: { scale: 120, threshold: 0.6 }, cluster: { count: 5, spread: 4 }, scale: [0.8, 1.2], tier: { high: 1, mid: 1, low: 0.7 } },
  jizo: { band: [6.6, 7.2], per10m: 0.035, scale: [0.95, 1.1], tier: { high: 1, mid: 1, low: 1 } },
}

/** Nothing stands closer than this to ANY road centreline (half width 4 m + rail + post). */
export const ROAD_CLEARANCE = 5.4
/** keep this far from the edge of a shortcut channel or the railway bed */
const CHANNEL_MARGIN = 3
/** only small plants (`town: true`) grow within this distance of a town street */
const TOWN_BUFFER = 16
/** keep this far outside a paved lot (town plaza, skidpad, gymkhana, peak) */
const LOT_MARGIN = 6
/** extra roadside tree clusters: one roll every N metres per side, trees at least this far from any road */
const CLUSTER_EVERY = 30
const CLUSTER_CLEARANCE = 10.5

/** One roadside placement. `tint` picks a colour variant; `keep` is the tier-thinning roll. */
export interface RoadsideItem {
  kind: RoadsideKind
  x: number
  y: number
  z: number
  yaw: number
  scale: number
  tint: number
  keep: number
}

/** A disc nothing may be placed in. */
export interface KeepOut {
  x: number
  z: number
  r: number
}

/**
 * Where the roadside vegetation goes: walks every road edge, rolls each kind's
 * density per 2 m sample and side, and rejects anything on or near any road,
 * in a town lot, a shortcut channel, the railway, or on top of an existing
 * prop (lamps, fences, corner boards, landmarks). Pure and seeded: the same
 * network always yields the same list.
 */
export class RoadsideLayout {
  readonly items: readonly RoadsideItem[]
  /** extra maple/pine clusters just behind the verge (reuse the forest's instanced models) */
  readonly trees: readonly TreeSpot[]
  private readonly zones: KeepOut[]
  private readonly channels: { c: Channel; minX: number; maxX: number; minZ: number; maxZ: number }[]
  private readonly patches = new ValueNoise(404)

  constructor(
    private readonly roads: RoadNetwork,
    private readonly terrain: TerrainHeights,
  ) {
    this.zones = RoadsideLayout.keepOuts(roads, terrain)
    this.channels = allChannels(roads).map((c) => {
      const m = c.width / 2 + CHANNEL_MARGIN
      const xs = c.points.map((p) => p.x)
      const zs = c.points.map((p) => p.z)
      return { c, minX: Math.min(...xs) - m, maxX: Math.max(...xs) + m, minZ: Math.min(...zs) - m, maxZ: Math.max(...zs) + m }
    })
    this.items = this.scatter()
    this.trees = this.treeClusters()
  }

  /** The items a quality tier draws (a deterministic subset of the full list). */
  forTier(tier: QualityTier): RoadsideItem[] {
    return this.items.filter((it) => it.keep < ROADSIDE_KINDS[it.kind].tier[tier])
  }

  /** True if (x, z) may hold a roadside prop that must stay `clearance` metres from every road. */
  allowed(x: number, z: number, clearance: number, town = false): boolean {
    const hit = this.roads.index.nearest(x, z, Math.max(clearance, TOWN_BUFFER))
    if (hit && hit.dist < clearance) return false
    if (hit && !town && hit.dist < TOWN_BUFFER && hit.edge.route === 'town') return false
    if (this.zones.some((k) => (k.x - x) ** 2 + (k.z - z) ** 2 < k.r * k.r)) return false
    for (const ch of this.channels) {
      if (x < ch.minX || x > ch.maxX || z < ch.minZ || z > ch.maxZ) continue
      if (channelDistance(ch.c, x, z).dist < ch.c.width / 2 + CHANNEL_MARGIN) return false
    }
    return true
  }

  /** Discs to avoid: the forest's keep-outs, paved lots, and every prop already beside the road. */
  static keepOuts(roads: RoadNetwork, terrain: TerrainHeights): KeepOut[] {
    const zones: KeepOut[] = [...treeKeepOut(roads)]
    for (const l of [...TOWN_LOTS, PEAK]) zones.push({ x: l.x, z: l.z, r: l.r + LOT_MARGIN })
    for (const l of lampSpots(roads)) zones.push({ x: l.pos.x, z: l.pos.z, r: 1.6 })
    for (const f of fenceSpots(roads)) zones.push({ x: f.pos.x, z: f.pos.z, r: 2.4 })
    for (const c of cornerSpots(roads)) zones.push({ x: c.board.x, z: c.board.z, r: 4 })
    for (const l of landmarks(roads, terrain)) zones.push({ x: l.x, z: l.z, r: l.model === 'torii' ? 3 : 6 })
    return zones
  }

  private scatter(): RoadsideItem[] {
    const out: RoadsideItem[] = []
    const kinds = Object.keys(ROADSIDE_KINDS) as RoadsideKind[]
    for (const [ei, e] of this.roads.edges.entries()) {
      // one stream per edge and kind, so tuning one kind never reshuffles the others
      kinds.forEach((kind, ki) => this.scatterKind(e, kind, mulberry32(9100 + ei * 97 + ki * 7919), out))
    }
    return out
  }

  private scatterKind(e: RoadEdge, kind: RoadsideKind, rnd: () => number, out: RoadsideItem[]): void {
    const rule = ROADSIDE_KINDS[kind]
    // samples are SAMPLE_SPACING (2 m) apart
    const perSample = rule.per10m / 5
    for (let i = 0; i < e.points.length; i++) {
      for (const side of [1, -1] as const) {
        let n = Math.floor(perSample) + (rnd() < perSample % 1 ? 1 : 0)
        while (n-- > 0) {
          const t = e.tangent(i)
          const l = leftOf(t.x, t.y)
          const off = (rule.band[0] + rnd() * (rule.band[1] - rule.band[0])) * side
          const along = (rnd() - 0.5) * 2
          const cx = e.points[i].x + l.x * off + t.x * along
          const cz = e.points[i].z + l.z * off + t.y * along
          if (rule.patch && this.patches.fbm(cx / rule.patch.scale + patchOffset(kind), cz / rule.patch.scale, 2) < rule.patch.threshold) continue
          const count = rule.cluster?.count ?? 1
          const spread = rule.cluster?.spread ?? 0
          for (let k = 0; k < count; k++) {
            const a = rnd() * Math.PI * 2
            const r = k === 0 ? 0 : spread * (0.4 + rnd() * 0.6)
            const x = cx + Math.cos(a) * r
            const z = cz + Math.sin(a) * r
            const yaw = kind === 'jizo' ? Math.atan2(-l.x * side, -l.z * side) : rnd() * Math.PI * 2
            const item = { kind, x, z, y: this.terrain.heightAt(x, z) - 0.04, yaw, scale: rule.scale[0] + rnd() * (rule.scale[1] - rule.scale[0]), tint: rnd(), keep: rnd() }
            if (this.allowed(x, z, Math.max(ROAD_CLEARANCE, rule.band[0] - 0.6), rule.town)) out.push(item)
          }
        }
      }
    }
  }

  /**
   * Small groups of maples (pines on some stretches) right behind the verge,
   * so the near forest reads as clumps rather than an even scatter.
   */
  private treeClusters(): TreeSpot[] {
    const rnd = mulberry32(7331)
    const out: TreeSpot[] = []
    for (const e of this.roads.edges) {
      if (e.route === 'town') continue
      for (let d = CLUSTER_EVERY / 2; d < e.length; d += CLUSTER_EVERY) {
        const i = Math.min(e.points.length - 1, Math.round((d / e.length) * (e.points.length - 1)))
        for (const side of [1, -1] as const) {
          const roll = rnd()
          const off = (12 + rnd() * 8) * side
          const n = 2 + Math.floor(rnd() * 3)
          const pines = this.patches.at(e.points[i].x / 90, e.points[i].z / 90) > 0.6
          if (roll > 0.55) continue
          const t = e.tangent(i)
          const l = leftOf(t.x, t.y)
          const cx = e.points[i].x + l.x * off
          const cz = e.points[i].z + l.z * off
          for (let k = 0; k < n; k++) {
            const a = rnd() * Math.PI * 2
            const r = k === 0 ? 0 : 3.5 + rnd() * 3
            const x = cx + Math.cos(a) * r
            const z = cz + Math.sin(a) * r
            const model = pines ? `tree_pine_${Math.floor(rnd() * 3)}` : `tree_maple_${Math.floor(rnd() * 4)}`
            const tree = { model, x, z, y: this.terrain.heightAt(x, z) - 0.2, yaw: rnd() * Math.PI * 2, scale: 0.75 + rnd() * 0.45 }
            if (this.allowed(x, z, CLUSTER_CLEARANCE)) out.push(tree)
          }
        }
      }
    }
    return out
  }
}

/** Per-kind offset into the patch noise so different kinds form different patches. */
function patchOffset(kind: RoadsideKind): number {
  return (Object.keys(ROADSIDE_KINDS) as RoadsideKind[]).indexOf(kind) * 17.3
}
