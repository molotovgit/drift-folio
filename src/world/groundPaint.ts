import * as THREE from 'three/webgpu'
import { clamp } from '../core/math'
import { palette } from '../render/palette'
import { BIOMES, type BiomeMap } from './biomes'
import type { RoadNetwork } from './roadNetwork'
import { ValueNoise } from './terrain'

/** A tree canopy that darkens the ground under it. */
export interface Canopy {
  x: number
  z: number
  /** shade radius, metres */
  r: number
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Bucket size of the canopy lookup grid, metres (larger than any canopy radius). */
const CANOPY_CELL = 12
/** The packed-dirt shoulder fades out between these distances from a road centreline. */
const DIRT_FROM = 4.5
const DIRT_TO = 8.5
/** shared empty bucket for cells without canopies (no per-vertex allocation) */
const NO_CANOPIES: readonly Canopy[] = []

/**
 * Ground colours of the two regions (dusk-dimmed, like the mountain's): the
 * valley's moss and rice-field green, the ward's dark paving with lighter
 * pavements along the streets.
 */
export const BIOME_GROUND = {
  templeGround: '#3e4a3a',
  templeMoss: '#5a6a3a',
  cityGround: '#2f2b3a',
  cityPavement: '#5c5670',
} as const

/**
 * Colours the terrain per vertex so the ground between props is never a flat
 * plain: the maroon autumn ground with patches of dry grass and orange leaf
 * litter, packed dirt along the road shoulders, violet shade under tree
 * canopies and darker steep slopes. Lantern Valley turns it mossy green and
 * Neon Ward paves it, blended by the biome weights. Pure function of position
 * (deterministic).
 */
export class GroundPaint {
  private readonly litterNoise = new ValueNoise(21)
  private readonly grassNoise = new ValueNoise(55)
  private readonly ground = new THREE.Color(palette.terrain)
  private readonly slopeShadow = new THREE.Color(palette.terrainShadow)
  private readonly leaves = new THREE.Color(palette.foliageOrange)
  private readonly grass = new THREE.Color(palette.groundGrass)
  private readonly dirt = new THREE.Color(palette.groundDirt)
  private readonly shade = new THREE.Color(palette.groundShade)
  private readonly templeGround = new THREE.Color(BIOME_GROUND.templeGround)
  private readonly templeMoss = new THREE.Color(BIOME_GROUND.templeMoss)
  private readonly cityGround = new THREE.Color(BIOME_GROUND.cityGround)
  private readonly cityPavement = new THREE.Color(BIOME_GROUND.cityPavement)
  /** scratch: the shoulder colour at the vertex being painted */
  private readonly shoulder = new THREE.Color()
  private readonly canopy = new Map<number, Canopy[]>()

  constructor(
    private readonly roads: RoadNetwork | null = null,
    canopies: readonly Canopy[] = [],
    private readonly biomes: BiomeMap = BIOMES,
  ) {
    for (const c of canopies) {
      const k = this.key(Math.floor(c.x / CANOPY_CELL), Math.floor(c.z / CANOPY_CELL))
      let bucket = this.canopy.get(k)
      if (!bucket) this.canopy.set(k, (bucket = []))
      bucket.push(c)
    }
  }

  /** Ground colour at (x, z) given the local slope (rise per metre). Writes into `out`. */
  colorAt(x: number, z: number, slope: number, out: THREE.Color): THREE.Color {
    out.copy(this.ground)
    // broad patches of dry grass, so open ground reads as a meadow, not a plain
    out.lerp(this.grass, 0.75 * smooth(0.4, 0.62, this.grassNoise.fbm(x / 55, z / 55, 3)))
    const litter = Math.max(0, this.litterNoise.fbm(x / 30, z / 30, 3) - 0.56) * 2.4
    out.lerp(this.leaves, Math.min(0.75, litter))
    const { temple, city } = this.biomes.biomeAt(x, z)
    // the valley: mossy ground with brighter green patches where the mountain has dry grass
    if (temple > 0) out.lerp(this.templeGround, 0.8 * temple).lerp(this.templeMoss, 0.6 * temple * smooth(0.45, 0.65, this.grassNoise.fbm(x / 40, z / 40, 3)))
    // the ward: dark paving everywhere
    if (city > 0) out.lerp(this.cityGround, 0.9 * city)
    if (this.roads) {
      const hit = this.roads.index.nearest(x, z, DIRT_TO)
      // dirt shoulders on the mountain and in the valley, pavements in the ward
      if (hit) out.lerp(this.shoulder.copy(this.dirt).lerp(this.cityPavement, city), 0.85 * (1 - smooth(DIRT_FROM, DIRT_TO, hit.dist)))
    }
    out.lerp(this.shade, 0.6 * this.shadeAt(x, z))
    return out.lerp(this.slopeShadow, Math.min(0.8, slope * 0.9))
  }

  /** 0..1 canopy shade: strongest under a trunk, fading to the canopy edge. */
  shadeAt(x: number, z: number): number {
    const cx = Math.floor(x / CANOPY_CELL)
    const cz = Math.floor(z / CANOPY_CELL)
    let s = 0
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const c of this.canopy.get(this.key(cx + dx, cz + dz)) ?? NO_CANOPIES) {
          const d2 = (c.x - x) ** 2 + (c.z - z) ** 2
          if (d2 < c.r * c.r) s = Math.max(s, 1 - smooth(c.r * 0.35, c.r, Math.sqrt(d2)))
        }
      }
    }
    return s
  }

  private key(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096)
  }
}
