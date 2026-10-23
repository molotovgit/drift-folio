import { clamp } from '../core/math'

/**
 * The world's three biomes: the autumn mountain pass (everything not claimed
 * by a region), Lantern Valley (the rural temple valley, −X behind the summit)
 * and Neon Ward (the night district south of the base town).
 */
export type Biome = 'mountain' | 'temple' | 'city'

/** How much of each biome a point belongs to; the three weights sum to 1. */
export interface BiomeWeights {
  mountain: number
  temple: number
  city: number
}

/** A themed region: a polygon (x, z) and how wide its border blend is. */
export interface BiomeRegion {
  biome: Exclude<Biome, 'mountain'>
  /** outline in world metres, either winding */
  outline: readonly (readonly [number, number])[]
  /** the weight ramps 0 → 1 across this band, centred on the outline */
  blend: number
}

/**
 * The regions' outlines, drawn round their roads (regionLayout.ts) with room
 * for the props beside them, and clear of the mountain roads: Lantern Valley
 * starts past the summit pad and the peak trail and stays well north of the
 * cluster yard; Neon Ward starts past the town's lots.
 */
export const BIOME_REGIONS: readonly BiomeRegion[] = [
  {
    biome: 'temple',
    blend: 60,
    outline: [
      [-110, -95], [-300, -95], [-520, -75], [-690, -15], [-700, 120], [-640, 262], [-480, 268], [-350, 210], [-262, 125], [-140, 45],
    ],
  },
  {
    biome: 'city',
    blend: 50,
    outline: [
      [205, 960], [650, 975], [700, 1110], [660, 1262], [300, 1272], [215, 1205], [195, 1060],
    ],
  },
]

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Polygon outline prepared for signed-distance queries (with a bounding box for cheap rejection). */
class RegionShape {
  private readonly minX: number
  private readonly maxX: number
  private readonly minZ: number
  private readonly maxZ: number

  constructor(readonly region: BiomeRegion) {
    const xs = region.outline.map((p) => p[0])
    const zs = region.outline.map((p) => p[1])
    const m = region.blend / 2
    this.minX = Math.min(...xs) - m
    this.maxX = Math.max(...xs) + m
    this.minZ = Math.min(...zs) - m
    this.maxZ = Math.max(...zs) + m
  }

  /** 0 outside the blend band, 1 deep inside, smooth across the outline. */
  weight(x: number, z: number): number {
    if (x < this.minX || x > this.maxX || z < this.minZ || z > this.maxZ) return 0
    const half = this.region.blend / 2
    return 1 - smoothstep(-half, half, this.signedDistance(x, z))
  }

  /** Distance to the outline, negative inside. */
  signedDistance(x: number, z: number): number {
    const pts = this.region.outline
    let best = Infinity
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, az] = pts[j]
      const [bx, bz] = pts[i]
      // even-odd rule for inside, segment distance for the magnitude
      if (bz > z !== az > z && x < ((ax - bx) * (z - bz)) / (az - bz) + bx) inside = !inside
      const dx = bx - ax
      const dz = bz - az
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1)
      best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z))
    }
    return inside ? -best : best
  }
}

/**
 * Answers "which biome is (x, z) in?" with smooth weights, so ground colours,
 * plant mixes and prop densities blend across each region's border instead of
 * switching at a line. Pure function of position (deterministic).
 */
export class BiomeMap {
  private readonly shapes: RegionShape[]

  constructor(regions: readonly BiomeRegion[] = BIOME_REGIONS) {
    this.shapes = regions.map((r) => new RegionShape(r))
  }

  /** Weights of the three biomes at (x, z), summing to 1. */
  biomeAt(x: number, z: number): BiomeWeights {
    const w: BiomeWeights = { mountain: 0, temple: 0, city: 0 }
    for (const s of this.shapes) w[s.region.biome] = Math.max(w[s.region.biome], s.weight(x, z))
    // regions never overlap by design; if their bands ever do, share the point between them
    const claimed = w.temple + w.city
    if (claimed > 1) {
      w.temple /= claimed
      w.city /= claimed
    }
    w.mountain = 1 - w.temple - w.city
    return w
  }

  /** One biome's weight at (x, z). */
  weight(biome: Biome, x: number, z: number): number {
    return this.biomeAt(x, z)[biome]
  }

  /** The biome with the largest weight at (x, z). */
  dominant(x: number, z: number): Biome {
    const w = this.biomeAt(x, z)
    return w.city > w.temple && w.city > w.mountain ? 'city' : w.temple > w.mountain ? 'temple' : 'mountain'
  }
}

/** The shared biome map of the world. */
export const BIOMES = new BiomeMap()

/**
 * Deterministic 0..1 roll from a position: biome thinning uses it instead of
 * drawing from a seeded stream, so filtering by biome never reshuffles the
 * placements of the mountain that came before.
 */
export function positionRoll(x: number, z: number, salt = 0): number {
  let h = (Math.round(x * 16) * 374761393 + Math.round(z * 16) * 668265263 + salt * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
