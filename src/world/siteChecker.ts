import { cornerSpots } from './cornerLayout'
import { lampSpots, landmarks } from './mountainLayout'
import type { RoadNetwork } from './roadNetwork'
import { allChannels, channelDistance, type Channel } from './shortcutLayout'
import type { TerrainHeights } from './terrain'

/** A disc nothing else may be placed in. */
export interface Disc {
  x: number
  z: number
  r: number
}

/** Bucket size of the occupancy grid, metres (larger than most discs). */
const CELL = 24

/**
 * Where a region prop may stand: clear of every road centreline, of the carved
 * channels (river, shortcuts), of the props already beside the roads (lamps,
 * corner billboards, landmarks) and of the region props placed before it.
 * Props claim discs as they are placed (`claim`), so later ones avoid them.
 */
export class SiteChecker {
  private readonly grid = new Map<number, Disc[]>()
  /** every disc claimed so far, in order (the regions' keep-outs for the roadside plants) */
  readonly claimed: Disc[] = []
  private readonly channels: Channel[]
  /** largest disc filed so far: queries scan cells this far round their own radius */
  private maxR = 0

  constructor(
    readonly roads: RoadNetwork,
    readonly terrain: TerrainHeights,
  ) {
    this.channels = allChannels(roads)
    // the mountain's props beside the roads, which region props must not stand in
    for (const l of lampSpots(roads)) this.add({ x: l.pos.x, z: l.pos.z, r: 1.6 })
    for (const c of cornerSpots(roads)) this.add({ x: c.board.x, z: c.board.z, r: 4 })
    for (const l of landmarks(roads, terrain)) this.add({ x: l.x, z: l.z, r: 3 })
  }

  /** Horizontal distance from (x, z) to the nearest road centreline (Infinity beyond `reach`). */
  roadDistance(x: number, z: number, reach = 80): number {
    return this.roads.index.nearest(x, z, reach)?.dist ?? Infinity
  }

  /** Clear of roads by `clearance`, of channels by `channelMargin`, and of every disc by `r`. */
  free(x: number, z: number, r: number, clearance: number, channelMargin = 3): boolean {
    if (this.roadDistance(x, z, clearance + 1) < clearance) return false
    for (const c of this.channels) if (channelDistance(c, x, z).dist < c.width / 2 + channelMargin + r) return false
    return !this.overlaps(x, z, r)
  }

  /** True if a disc of radius r at (x, z) overlaps any claimed or pre-existing disc. */
  overlaps(x: number, z: number, r: number): boolean {
    return this.near(x, z, r).length > 0
  }

  /** Every disc overlapping the disc of radius r at (x, z). */
  near(x: number, z: number, r: number): Disc[] {
    const cx = Math.floor(x / CELL)
    const cz = Math.floor(z / CELL)
    const reach = Math.ceil((r + this.maxR) / CELL)
    const out: Disc[] = []
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        for (const d of this.grid.get(SiteChecker.key(cx + dx, cz + dz)) ?? []) if ((d.x - x) ** 2 + (d.z - z) ** 2 < (d.r + r) ** 2) out.push(d)
      }
    }
    return out
  }

  /** Reserve a disc for a placed prop. */
  claim(d: Disc): void {
    this.add(d)
    this.claimed.push(d)
  }

  private add(d: Disc): void {
    // filed under its centre cell; queries scan neighbours far enough for the largest disc
    this.maxR = Math.max(this.maxR, d.r)
    const k = SiteChecker.key(Math.floor(d.x / CELL), Math.floor(d.z / CELL))
    let bucket = this.grid.get(k)
    if (!bucket) this.grid.set(k, (bucket = []))
    bucket.push(d)
  }

  private static key(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096)
  }
}
