import { clamp, lerp } from '../core/math'
import { LotSurface } from './lotSurface'
import type { RoadHit, RoadNetwork } from './roadNetwork'
import type { Channel } from './shortcutLayout'
import type { FlatLot } from './townLayout'

/** Smoothstep 0→1 between edge0 and edge1. */
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Deterministic 2D value noise + fBm (no dependencies, same result every load). */
export class ValueNoise {
  constructor(private readonly seed = 1337) {}

  private hash(ix: number, iz: number): number {
    let h = (ix * 374761393 + iz * 668265263 + this.seed * 2147483647) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295
  }

  /** Smooth noise in [0, 1]. */
  at(x: number, z: number): number {
    const ix = Math.floor(x)
    const iz = Math.floor(z)
    const fx = x - ix
    const fz = z - iz
    const u = fx * fx * (3 - 2 * fx)
    const v = fz * fz * (3 - 2 * fz)
    const a = this.hash(ix, iz)
    const b = this.hash(ix + 1, iz)
    const c = this.hash(ix, iz + 1)
    const d = this.hash(ix + 1, iz + 1)
    return lerp(lerp(a, b, u), lerp(c, d, u), v)
  }

  /** Fractal sum of `octaves` layers, roughly in [0, 1]. */
  fbm(x: number, z: number, octaves = 4): number {
    let sum = 0
    let amp = 0.5
    let f = 1
    let norm = 0
    for (let o = 0; o < octaves; o++) {
      sum += this.at(x * f, z * f) * amp
      norm += amp
      amp *= 0.5
      f *= 2
    }
    return sum / norm
  }
}

/** World rectangle covered by the terrain grid. */
export interface TerrainBounds {
  minX: number
  minZ: number
  size: number
}

export const TERRAIN_BOUNDS: TerrainBounds = { minX: -690, minZ: -300, size: 1420 }
/** grid cells per side (vertices = cells + 1) */
export const TERRAIN_CELLS = 355
/** road surface sits this far above the carved terrain under it */
export const ROAD_LIFT = 0.12
/** terrain is carved flat this far from the road centreline, then blends out */
const CARVE_FLAT = 10
const CARVE_BLEND = 28
/** channel banks blend into the hillside over this distance */
const CHANNEL_BLEND = 16
/** coarse road samples used for the smooth "valley" height field */
const COARSE_STEP = 5

/**
 * The mountain's height field. Heights are computed once on a regular grid:
 * a smooth base interpolated from nearby road heights (so roads never sit in
 * trenches or on stilts), hills from fBm noise that grow with distance from the
 * road, and a flat carve under every road. `heightAt` bilinearly samples it.
 */
export class TerrainHeights {
  readonly cells = TERRAIN_CELLS
  readonly bounds = TERRAIN_BOUNDS
  /** (cells+1)² heights, row-major: index = iz * (cells+1) + ix */
  readonly heights: Float32Array
  private readonly noise = new ValueNoise(7)
  private readonly channels: { c: Channel; box: ChannelBox }[]
  private readonly lots: LotSurface[]

  constructor(
    private readonly roads: RoadNetwork,
    /** paved lots (town) the ground is flattened under */
    lots: readonly FlatLot[] = [],
    /** dirt shortcuts and the railway bed, carved to their height profile */
    channels: readonly Channel[] = [],
  ) {
    this.lots = lots.map((l) => LotSurface.of(l, roads))
    this.channels = channels.map((c) => ({ c, box: ChannelBox.of(c) }))
    const n = this.cells + 1
    this.heights = new Float32Array(n * n)
    const base = this.baseGrid()
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = this.bounds.minX + (ix / this.cells) * this.bounds.size
        const z = this.bounds.minZ + (iz / this.cells) * this.bounds.size
        this.heights[iz * n + ix] = this.computeHeight(x, z, base.at(x, z))
      }
    }
  }

  get cellSize(): number {
    return this.bounds.size / this.cells
  }

  /** Bilinear height at world (x, z); clamps outside the grid. */
  heightAt(x: number, z: number): number {
    const n = this.cells + 1
    const gx = clamp(((x - this.bounds.minX) / this.bounds.size) * this.cells, 0, this.cells - 1e-6)
    const gz = clamp(((z - this.bounds.minZ) / this.bounds.size) * this.cells, 0, this.cells - 1e-6)
    const ix = Math.floor(gx)
    const iz = Math.floor(gz)
    const fx = gx - ix
    const fz = gz - iz
    const h = this.heights
    const a = h[iz * n + ix]
    const b = h[iz * n + ix + 1]
    const c = h[(iz + 1) * n + ix]
    const d = h[(iz + 1) * n + ix + 1]
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fz)
  }

  private computeHeight(x: number, z: number, base: number): number {
    const hits = this.roads.index.nearestPerEdge(x, z, CARVE_BLEND + 4)
    const hit = hits[0]
    // hills rise away from the roads; a gentle large-scale swell plus finer ridges
    const away = hit ? smooth(CARVE_FLAT + 4, 90, hit.dist) : 1
    const swell = (this.noise.fbm(x / 260, z / 260, 3) - 0.35) * 70
    const ridges = (this.noise.fbm(x / 70, z / 70, 4) - 0.5) * 22
    const natural = base + (swell + ridges) * away
    const withLots = this.carveChannels(x, z, this.flattenLots(x, z, natural))
    if (!hit) return Math.min(withLots, this.floorAt(x, z) - ROAD_LIFT)
    // carve: just under the nearest road's (possibly banked) surface, blending out to the natural slope
    let h = lerp(TerrainHeights.surfaceUnder(hit, x, z) - ROAD_LIFT, withLots, smooth(CARVE_FLAT, CARVE_BLEND, hit.dist))
    // never let the ground rise through any road surface (junctions, stacked switchbacks)
    for (const other of hits) if (other.dist < CARVE_FLAT) h = Math.min(h, TerrainHeights.surfaceUnder(other, x, z) - ROAD_LIFT)
    // nor through a lot or channel floor where it ramps to meet a road inside the road's carve
    return Math.min(h, this.floorAt(x, z) - ROAD_LIFT)
  }

  /** Road surface height at (x, z), continued sideways past the asphalt with the road's cross-slope. */
  private static surfaceUnder(hit: RoadHit, x: number, z: number): number {
    return hit.edge.surfaceNear(hit.index, x, z, CARVE_FLAT)
  }

  /** Flatten the ground under each lot (just below its paved top), blending out over 25 m. */
  private flattenLots(x: number, z: number, h: number): number {
    for (const l of this.lots) {
      const d = Math.hypot(x - l.lot.x, z - l.lot.z)
      if (d < l.lot.r + 25) h = lerp(l.heightAt(x, z) - ROAD_LIFT, h, smooth(l.lot.r + 1, l.lot.r + 25, d))
    }
    return h
  }

  /** Carve each channel: flat floor at its profile height (meeting the roads it touches), blending into the hillside. */
  private carveChannels(x: number, z: number, h: number): number {
    for (const { c, box } of this.channels) {
      if (!box.near(x, z)) continue
      const { dist, y } = TerrainHeights.nearestOnChannel(c, x, z)
      if (dist < c.width / 2 + CHANNEL_BLEND) h = lerp(this.roads.meet(x, z, y) - ROAD_LIFT, h, smooth(c.width / 2, c.width / 2 + CHANNEL_BLEND, dist))
    }
    return h
  }

  /**
   * Lowest paved or channel floor covering (x, z) (Infinity if none). Floors
   * reach a grid cell and a half (a cell diagonal) past their edge: the ground between grid vertices is
   * interpolated, so a vertex just outside a narrow floor must be low too.
   */
  private floorAt(x: number, z: number): number {
    let floor = Infinity
    for (const l of this.lots) if (l.contains(x, z, this.cellSize * 1.5)) floor = Math.min(floor, l.heightAt(x, z))
    for (const { c, box } of this.channels) {
      if (!box.near(x, z)) continue
      const { dist, y, cx, cz } = TerrainHeights.nearestOnChannel(c, x, z)
      if (dist >= c.width / 2 + this.cellSize * 1.5) continue
      // past the floor's edge, hold the edge's height (not the ramp of whatever road is beside it)
      const k = Math.min(1, c.width / 2 / (dist || 1))
      floor = Math.min(floor, this.roads.meet(cx + (x - cx) * k, cz + (z - cz) * k, y))
    }
    return floor
  }

  /** Distance from (x, z) to a channel's centreline, the closest centreline point and its profile height. */
  private static nearestOnChannel(c: Channel, x: number, z: number): { dist: number; y: number; cx: number; cz: number } {
    let best = Infinity
    let y = 0
    let cx = x
    let cz = z
    for (let i = 0; i < c.points.length - 1; i++) {
      const a = c.points[i]
      const b = c.points[i + 1]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1)
      const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z)
      if (d < best) {
        best = d
        y = a.y + (b.y - a.y) * t
        cx = a.x + dx * t
        cz = a.z + dz * t
      }
    }
    return { dist: best, y, cx, cz }
  }

  /**
   * The smooth road-following body is expensive (Gaussian over nearby road samples),
   * so evaluate it on a coarse grid once and bilinearly interpolate per vertex.
   */
  private baseGrid() {
    const coarse = this.coarseRoadSamples()
    const step = 4 // one base sample per 4 terrain cells
    const m = Math.ceil(this.cells / step) + 1
    const grid = new Float32Array(m * m)
    const span = (step / this.cells) * this.bounds.size
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) grid[j * m + i] = coarse.smoothHeight(this.bounds.minX + i * span, this.bounds.minZ + j * span)
    return {
      at: (x: number, z: number) => {
        const gx = clamp((x - this.bounds.minX) / span, 0, m - 1 - 1e-6)
        const gz = clamp((z - this.bounds.minZ) / span, 0, m - 1 - 1e-6)
        const i = Math.floor(gx)
        const j = Math.floor(gz)
        const fx = gx - i
        const fz = gz - j
        return lerp(lerp(grid[j * m + i], grid[j * m + i + 1], fx), lerp(grid[(j + 1) * m + i], grid[(j + 1) * m + i + 1], fx), fz)
      },
    }
  }

  private coarseRoadSamples(): CoarseSamples {
    const pts: { x: number; y: number; z: number }[] = []
    for (const e of this.roads.edges) {
      const stride = Math.max(1, Math.round(COARSE_STEP / 2))
      for (let i = 0; i < e.points.length; i += stride) pts.push(e.points[i])
    }
    return new CoarseSamples(pts)
  }
}

/**
 * Gaussian-weighted average of road heights within ~150 m, bucketed on a 40 m
 * grid. Gives a smooth mountain body that follows the roads' descent.
 */
class CoarseSamples {
  private readonly grid = new Map<number, { x: number; y: number; z: number }[]>()
  private static readonly CELL = 40
  private static readonly RADIUS = 160
  private static readonly SIGMA = 70

  constructor(points: { x: number; y: number; z: number }[]) {
    for (const p of points) {
      const k = this.key(Math.floor(p.x / CoarseSamples.CELL), Math.floor(p.z / CoarseSamples.CELL))
      let b = this.grid.get(k)
      if (!b) this.grid.set(k, (b = []))
      b.push(p)
    }
  }

  smoothHeight(x: number, z: number): number {
    const r = Math.ceil(CoarseSamples.RADIUS / CoarseSamples.CELL)
    const cx = Math.floor(x / CoarseSamples.CELL)
    const cz = Math.floor(z / CoarseSamples.CELL)
    const inv2s2 = 1 / (2 * CoarseSamples.SIGMA * CoarseSamples.SIGMA)
    let wSum = 0
    let hSum = 0
    let nearestD2 = Infinity
    let nearestY = -60
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        for (const p of this.grid.get(this.key(cx + dx, cz + dz)) ?? []) {
          const d2 = (p.x - x) ** 2 + (p.z - z) ** 2
          if (d2 < nearestD2) {
            nearestD2 = d2
            nearestY = p.y
          }
          const w = Math.exp(-d2 * inv2s2)
          wSum += w
          hSum += w * p.y
        }
      }
    }
    // far from every road: fall back to the nearest one we saw (or the mid-mountain height)
    return wSum > 1e-6 ? hSum / wSum : nearestY
  }

  private key(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096)
  }
}

/** Axis-aligned bounds of a channel plus its blend margin (cheap rejection per vertex). */
class ChannelBox {
  private constructor(
    private readonly minX: number,
    private readonly maxX: number,
    private readonly minZ: number,
    private readonly maxZ: number,
  ) {}

  static of(c: Channel): ChannelBox {
    const m = c.width / 2 + CHANNEL_BLEND
    const xs = c.points.map((p) => p.x)
    const zs = c.points.map((p) => p.z)
    return new ChannelBox(Math.min(...xs) - m, Math.max(...xs) + m, Math.min(...zs) - m, Math.max(...zs) + m)
  }

  near(x: number, z: number): boolean {
    return x >= this.minX && x <= this.maxX && z >= this.minZ && z <= this.maxZ
  }
}
