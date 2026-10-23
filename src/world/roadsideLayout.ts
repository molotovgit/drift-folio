import type { QualityTier } from '../render/post'
import { BIOMES, positionRoll, type BiomeWeights } from './biomes'
import { fenceSpots } from './breakables'
import { cornerSpots } from './cornerLayout'
import { mulberry32 } from './dressing'
import { lampSpots, landmarks, treeKeepOut, type TreeSpot } from './mountainLayout'
import { RegionLayouts } from './regionLayouts'
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

/**
 * Share of each kind kept per biome (the mountain keeps all). The valley trades
 * susuki and rocks for ferns and bamboo-edge greenery (its groves and paddies
 * are TempleLayout props); the ward keeps a few weeds and planter shrubs, its
 * verges are pavements.
 */
export const BIOME_DENSITY: Readonly<Record<RoadsideKind, { temple: number; city: number }>> = {
  grass: { temple: 0.8, city: 0.12 },
  flowers: { temple: 0.5, city: 0 },
  pampas: { temple: 0.35, city: 0 },
  fern: { temple: 1, city: 0 },
  bush: { temple: 0.8, city: 0.15 },
  rock: { temple: 0.6, city: 0 },
  bamboo: { temple: 1, city: 0 },
  jizo: { temple: 1, city: 0 },
}

/** Nothing stands closer than this to ANY road centreline (half width 4 m + rail + post). */
export const ROAD_CLEARANCE = 5.4
/** keep this far from the edge of a shortcut channel or the railway bed */
export const CHANNEL_MARGIN = 3
/** only small plants (`town: true`) grow within this distance of a town street */
const TOWN_BUFFER = 16
/** keep this far outside a paved lot (town plaza, skidpad, gymkhana, peak) */
export const LOT_MARGIN = 6
/** keep-out radius around each landmark model: half its footprint plus a step (tools/blender/ASSETS.md sizes) */
export const LANDMARK_CLEARANCE: Readonly<Record<string, number>> = {
  // the road runs through the torii: the disc must reach its posts, 5.9 m either side
  torii: 7.5,
  vending_machine_red: 2,
  vending_machine_blue: 2,
  signpost: 2.5,
  shrine: 3,
  tea_house: 6.5,
  house_0: 6,
  house_1: 6,
}
const DEFAULT_LANDMARK_CLEARANCE = 6
/** cell size of the keep-out disc grid, metres */
const ZONE_CELL = 32
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
 * Keep-out discs bucketed into ZONE_CELL squares (each disc in every cell its
 * bounding box touches), so a point test reads one cell instead of every disc.
 */
class DiscGrid {
  private readonly cells = new Map<number, KeepOut[]>()

  constructor(discs: readonly KeepOut[]) {
    for (const d of discs) {
      for (let cz = Math.floor((d.z - d.r) / ZONE_CELL); cz <= Math.floor((d.z + d.r) / ZONE_CELL); cz++) {
        for (let cx = Math.floor((d.x - d.r) / ZONE_CELL); cx <= Math.floor((d.x + d.r) / ZONE_CELL); cx++) {
          const k = DiscGrid.key(cx, cz)
          let bucket = this.cells.get(k)
          if (!bucket) this.cells.set(k, (bucket = []))
          bucket.push(d)
        }
      }
    }
  }

  /** True if (x, z) lies strictly inside any disc. */
  contains(x: number, z: number): boolean {
    const bucket = this.cells.get(DiscGrid.key(Math.floor(x / ZONE_CELL), Math.floor(z / ZONE_CELL)))
    if (!bucket) return false
    for (const d of bucket) if ((d.x - x) ** 2 + (d.z - z) ** 2 < d.r * d.r) return true
    return false
  }

  private static key(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096)
  }
}

/** Both sides of a road sample: +1 = left of travel, −1 = right. */
const SIDES = [1, -1] as const

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
  private readonly zones: DiscGrid
  private readonly channels: { c: Channel; minX: number; maxX: number; minZ: number; maxZ: number }[]
  private readonly patches = new ValueNoise(404)

  /** `forest` is the forest's keep-outs (`treeKeepOut`), passed in when the caller already has them. */
  constructor(
    private readonly roads: RoadNetwork,
    private readonly terrain: TerrainHeights,
    forest: readonly KeepOut[] = treeKeepOut(roads),
  ) {
    this.zones = new DiscGrid(RoadsideLayout.keepOuts(roads, terrain, forest))
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
    if (this.zones.contains(x, z)) return false
    for (const ch of this.channels) {
      if (x < ch.minX || x > ch.maxX || z < ch.minZ || z > ch.maxZ) continue
      if (channelDistance(ch.c, x, z).dist < ch.c.width / 2 + CHANNEL_MARGIN) return false
    }
    return true
  }

  /** Discs to avoid: the forest's keep-outs, paved lots, and every prop already beside the road. */
  static keepOuts(roads: RoadNetwork, terrain: TerrainHeights, forest: readonly KeepOut[] = treeKeepOut(roads)): KeepOut[] {
    const zones: KeepOut[] = [...forest]
    for (const l of [...TOWN_LOTS, PEAK]) zones.push({ x: l.x, z: l.z, r: l.r + LOT_MARGIN })
    for (const l of lampSpots(roads)) zones.push({ x: l.pos.x, z: l.pos.z, r: 1.6 })
    for (const f of fenceSpots(roads)) zones.push({ x: f.pos.x, z: f.pos.z, r: 2.4 })
    for (const c of cornerSpots(roads)) zones.push({ x: c.board.x, z: c.board.z, r: 4 })
    for (const l of landmarks(roads, terrain)) zones.push({ x: l.x, z: l.z, r: LANDMARK_CLEARANCE[l.model] ?? DEFAULT_LANDMARK_CLEARANCE })
    // the regions' own props: temple buildings, paddies, river, city blocks
    zones.push(...RegionLayouts.of(roads, terrain).keepOuts)
    return zones
  }

  /**
   * Does the biome at (x, z) keep a `kind` plant? Rolled from the position, not
   * the seeded stream, so the mountain (weight 1, always kept) never reshuffles.
   */
  static biomeKeeps(kind: RoadsideKind, x: number, z: number): boolean {
    const w = BIOMES.biomeAt(x, z, BIOME_SCRATCH)
    if (w.mountain >= 1) return true
    const f = BIOME_DENSITY[kind]
    return positionRoll(x, z, 31 + Math.round(PATCH_OFFSET[kind])) < w.mountain + w.temple * f.temple + w.city * f.city
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
    const count = rule.cluster?.count ?? 1
    const spread = rule.cluster?.spread ?? 0
    const clearance = Math.max(ROAD_CLEARANCE, rule.band[0] - 0.6)
    for (let i = 0; i < e.points.length; i++) {
      const t = e.tangent(i)
      const l = leftOf(t.x, t.y)
      for (const side of SIDES) {
        let n = Math.floor(perSample) + (rnd() < perSample % 1 ? 1 : 0)
        while (n-- > 0) {
          const off = (rule.band[0] + rnd() * (rule.band[1] - rule.band[0])) * side
          const along = (rnd() - 0.5) * 2
          const cx = e.points[i].x + l.x * off + t.x * along
          const cz = e.points[i].z + l.z * off + t.y * along
          if (rule.patch && this.patches.fbm(cx / rule.patch.scale + PATCH_OFFSET[kind], cz / rule.patch.scale, 2) < rule.patch.threshold) continue
          for (let k = 0; k < count; k++) {
            const a = rnd() * Math.PI * 2
            const r = k === 0 ? 0 : spread * (0.4 + rnd() * 0.6)
            const x = cx + Math.cos(a) * r
            const z = cz + Math.sin(a) * r
            // every roll is drawn before the keep-out test, so a rejection never shifts the stream
            const yaw = kind === 'jizo' ? Math.atan2(-l.x * side, -l.z * side) : rnd() * Math.PI * 2
            const scale = rule.scale[0] + rnd() * (rule.scale[1] - rule.scale[0])
            const tint = rnd()
            const keep = rnd()
            if (this.allowed(x, z, clearance, rule.town) && RoadsideLayout.biomeKeeps(kind, x, z)) out.push({ kind, x, z, y: this.terrain.heightAt(x, z) - 0.04, yaw, scale, tint, keep })
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
        for (const side of SIDES) {
          const roll = rnd()
          const off = (12 + rnd() * 8) * side
          const n = 2 + Math.floor(rnd() * 3)
          if (roll > 0.55) continue
          const pines = this.patches.at(e.points[i].x / 90, e.points[i].z / 90) > 0.6
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
            // no woods in the ward (a position roll, so the mountain's clusters never reshuffle)
            if (this.allowed(x, z, CLUSTER_CLEARANCE) && positionRoll(x, z, 77) >= BIOMES.weight('city', x, z)) out.push(tree)
          }
        }
      }
    }
    return out
  }
}

/** Per-kind offset into the patch noise so different kinds form different patches. */
const PATCH_OFFSET = Object.fromEntries((Object.keys(ROADSIDE_KINDS) as RoadsideKind[]).map((k, i) => [k, i * 17.3])) as Record<RoadsideKind, number>
/** scratch biome weights for the per-candidate density roll */
const BIOME_SCRATCH: BiomeWeights = { mountain: 0, temple: 0, city: 0 }
