import type { QualityTier } from '../render/post'
import { BIOMES } from './biomes'
import { mulberry32 } from './dressing'
import { leftOf } from './roadMesh'
import { SAMPLE_SPACING } from './roadLayout'
import type { RoadEdge } from './roadNetwork'
import type { Disc, SiteChecker } from './siteChecker'
import type { PropSpot } from './templeLayout'

/** A building block: an oriented box standing on the ground, its front (+Z local) facing a street. */
export interface Building {
  x: number
  z: number
  yaw: number
  /** width (local X), depth (local Z), height above its base */
  w: number
  d: number
  h: number
  /** base sunk below the lowest ground under it */
  y: number
  /** facade tint roll 0..1 */
  tint: number
  /** a front-row block on a street (gets signs and shopfronts) or a background tower */
  front: boolean
}

export type SignKind = 'blade' | 'band' | 'roof'

/** A neon sign: a panel centred at (x, y, z), facing yaw (panel normal = local +Z), using one atlas cell. */
export interface NeonSign {
  kind: SignKind
  x: number
  y: number
  z: number
  yaw: number
  w: number
  h: number
  /** index into the sign atlas (blade cells for blades, band cells otherwise) */
  cell: number
  /** big signs stay on every tier; small ones go on low */
  primary: boolean
}

/** The elevated expressway over the ward: a straight deck along x = OVERPASS.x. */
export const OVERPASS = { x: 446, z0: 935, z1: 1335, width: 12, clearance: 9.5, span: 22 }
/** an expressway pillar's half-size across (x) and along (z) the deck */
export const PILLAR = { hx: 1, hz: 1.4 }
/** ward pavements run from the road edge to this far from the centreline */
export const PAVE_OUTER = 8
/** pillars stand clear of the pavements by a step */
const PILLAR_CLEARANCE = PAVE_OUTER + 1.5 + PILLAR.hz
/** front faces of the street blocks stand this far from the centreline (8 m of pavement and forecourt) */
export const CITY_FRONT = 12.5
/** background towers stand at least this far from every street */
const TOWER_SETBACK = 32
/** blocks keep this far from the expressway's centreline */
const OVERPASS_MARGIN = OVERPASS.width / 2 + 3
/** blocks and signs only where the ward holds at least this weight */
const MIN_WEIGHT = 0.55
/** sign atlas layout: cells per kind (see NeonAtlas) */
export const BLADE_CELLS = 8
export const BAND_CELLS = 8

/** Fraction of small props kept per tier (buildings and big signs stay on every tier). */
export const CITY_TIERS: Readonly<Record<'vending' | 'detail', Readonly<Record<QualityTier, number>>>> = {
  vending: { high: 1, mid: 0.7, low: 0.4 },
  // the small signs and the wet sheen: shown (1) or not (0)
  detail: { high: 1, mid: 1, low: 0 },
}

/**
 * Where Neon Ward's props go: rows of building blocks along every street
 * (fronts CITY_FRONT from the centreline, behind the pavements), taller
 * towers behind them for the skyline, neon signs on the street blocks (a blade
 * sign at a corner, a band over the shopfronts, a billboard on some roofs),
 * vending machines on the forecourts and the expressway on pillars. Pure and
 * seeded; nothing stands on the asphalt, in another block or in the
 * expressway's corridor.
 */
export class CityLayout {
  readonly buildings: Building[] = []
  readonly signs: NeonSign[] = []
  readonly vending: PropSpot[] = []
  /** expressway pillar feet (x, z) and the deck height */
  readonly pillars: { x: number; z: number }[] = []
  readonly deckY: number
  private readonly rnd = mulberry32(8080)
  private readonly edges: RoadEdge[]

  constructor(private readonly site: SiteChecker) {
    this.edges = site.roads.edges.filter((e) => e.route === 'city')
    this.deckY = this.expressway()
    for (const e of this.edges) for (const side of [1, -1] as const) this.streetRow(e, side)
    this.towers()
    for (const b of this.buildings) site.claim({ x: b.x, z: b.z, r: Math.hypot(b.w, b.d) / 2 })
  }

  /** The vending machines a quality tier draws. */
  vendingForTier(tier: QualityTier): PropSpot[] {
    return this.vending.filter((v) => v.keep < CITY_TIERS.vending[tier])
  }

  /** Pillars every OVERPASS.span metres, skipping any that would stand near a street; returns the deck height. */
  private expressway(): number {
    let top = -Infinity
    for (let z = OVERPASS.z0; z <= OVERPASS.z1; z += 4) {
      const hit = this.site.roads.index.nearest(OVERPASS.x, z, 10)
      top = Math.max(top, hit ? hit.point.y : this.site.terrain.heightAt(OVERPASS.x, z))
    }
    for (let z = OVERPASS.z0; z <= OVERPASS.z1; z += OVERPASS.span) {
      // the whole pillar clear of the pavement plus a step
      if (this.site.roadDistance(OVERPASS.x, z, PILLAR_CLEARANCE + 2) < PILLAR_CLEARANCE) continue
      this.pillars.push({ x: OVERPASS.x, z })
      this.site.claim({ x: OVERPASS.x, z, r: 2 })
    }
    // no trees or plants under the deck or in its abutments
    for (let z = OVERPASS.z0; z <= OVERPASS.z1; z += 8) this.site.claim({ x: OVERPASS.x, z, r: OVERPASS.width / 2 + 1 })
    return top + OVERPASS.clearance
  }

  /** Blocks shoulder to shoulder along one side of a street, each facing it. */
  private streetRow(e: RoadEdge, side: 1 | -1): void {
    let d = 6
    while (d < e.length - 6) {
      const w = 11 + this.rnd() * 10
      const depth = 10 + this.rnd() * 8
      const h = 9 + this.rnd() ** 1.5 * 24
      const gap = 1.5 + this.rnd() * 3
      const tint = this.rnd()
      const signRolls = [this.rnd(), this.rnd(), this.rnd(), this.rnd(), this.rnd()]
      const i = Math.min(e.points.length - 1, Math.max(0, Math.round((d + w / 2) / SAMPLE_SPACING)))
      d += w + gap
      const p = e.points[i]
      const t = e.tangent(i)
      const l = leftOf(t.x, t.y)
      const off = (CITY_FRONT + depth / 2) * side
      const x = p.x + l.x * off
      const z = p.z + l.z * off
      // the front faces the street: local +Z points back toward the road
      const yaw = Math.atan2(-l.x * side, -l.z * side)
      const b = this.place(x, z, yaw, w, depth, h, tint, true, CITY_FRONT - 0.5)
      if (b) this.dress(b, signRolls)
    }
  }

  /** Taller towers on a jittered grid behind the street blocks. */
  private towers(): void {
    for (let gz = 960; gz < 1290; gz += 30) {
      for (let gx = 215; gx < 700; gx += 30) {
        const x = gx + (this.rnd() - 0.5) * 10
        const z = gz + (this.rnd() - 0.5) * 10
        const w = 14 + this.rnd() * 10
        const depth = 14 + this.rnd() * 10
        const h = 24 + this.rnd() * 36
        const yaw = (this.rnd() - 0.5) * 0.3
        const tint = this.rnd()
        if (BIOMES.weight('city', x, z) < 0.75) continue
        this.place(x, z, yaw, w, depth, h, tint, false, TOWER_SETBACK)
      }
    }
  }

  /** Add a block if its footprint is clear of streets, the expressway, other blocks and the props beside the roads. */
  private place(x: number, z: number, yaw: number, w: number, d: number, h: number, tint: number, front: boolean, clearance: number): Building | null {
    if (BIOMES.weight('city', x, z) < MIN_WEIGHT) return null
    const corners = CityLayout.corners(x, z, yaw, w, d)
    if ([...corners, { x, z }].some((c) => this.site.roadDistance(c.x, c.z, clearance + 2) < clearance)) return null
    // clear of the expressway corridor (no corner inside it, and not straddling it)
    const xs = corners.map((c) => c.x)
    if (Math.max(...xs) > OVERPASS.x - OVERPASS_MARGIN && Math.min(...xs) < OVERPASS.x + OVERPASS_MARGIN) return null
    const b: Building = { x, z, yaw, w, d, h, y: 0, tint, front }
    if (this.buildings.some((o) => CityLayout.rectsOverlap(b, o, 1))) return null
    if (this.site.near(x, z, Math.hypot(w, d) / 2).some((disc) => CityLayout.rectDiscDistance(b, disc) < disc.r)) return null
    b.y = Math.min(...[...corners, { x, z }].map((c) => this.site.terrain.heightAt(c.x, c.z))) - 0.6
    this.buildings.push(b)
    return b
  }

  /** Signs and vending machines on a street block. */
  private dress(b: Building, rolls: number[]): void {
    const base = b.y + 0.6
    // world position of a point in the block's frame (local +Z is the front)
    const at = (lx: number, ly: number, lz: number) => ({
      x: b.x + Math.cos(b.yaw) * lx + Math.sin(b.yaw) * lz,
      y: base + ly,
      z: b.z - Math.sin(b.yaw) * lx + Math.cos(b.yaw) * lz,
    })
    // a band over the shopfronts
    const band = at(0, 4.3, b.d / 2 + 0.25)
    this.signs.push({ kind: 'band', ...band, yaw: b.yaw, w: b.w * 0.7, h: 1.4, cell: Math.floor(rolls[0] * BAND_CELLS), primary: true })
    // a blade sign at one front corner, sticking out toward the street
    if (rolls[1] < 0.85) {
      const sideX = rolls[2] < 0.5 ? -1 : 1
      const bh = Math.min(3.5 + rolls[3] * 5, b.h - 6)
      if (bh > 2.5) {
        const blade = at(sideX * (b.w / 2 - 1), 6 + bh / 2, b.d / 2 + 1)
        // the panel faces along the street (block's local ±X)
        this.signs.push({ kind: 'blade', ...blade, yaw: b.yaw + Math.PI / 2, w: 1.5, h: bh, cell: Math.floor(rolls[4] * BLADE_CELLS), primary: rolls[3] > 0.4 })
      }
    }
    // a billboard on the roof of the taller blocks
    if (b.h > 18 && rolls[2] > 0.55) {
      const roof = at(0, b.h + 2.6, b.d / 2 - 1.5)
      this.signs.push({ kind: 'roof', ...roof, yaw: b.yaw, w: b.w * 0.8, h: 3.6, cell: Math.floor(rolls[3] * BAND_CELLS), primary: false })
    }
    // two vending machines on the forecourt of some blocks
    if (rolls[4] < 0.35) {
      for (const lx of [-0.55, 0.55]) {
        const v = at(b.w * 0.3 + lx, 0, b.d / 2 + 1.2)
        if (this.site.roadDistance(v.x, v.z, 12) < CITY_FRONT - 3) continue
        this.vending.push({ x: v.x, y: this.site.terrain.heightAt(v.x, v.z), z: v.z, yaw: b.yaw, scale: 1, keep: rolls[0] })
        this.site.claim({ x: v.x, z: v.z, r: 0.9 })
      }
    }
  }

  /** The four footprint corners of an oriented rectangle. */
  static corners(x: number, z: number, yaw: number, w: number, d: number): { x: number; z: number }[] {
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    return [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([a, b]) => ({ x: x + c * (a * w) / 2 + s * (b * d) / 2, z: z - s * (a * w) / 2 + c * (b * d) / 2 }))
  }

  /** Separating-axis test for two oriented footprints, grown by `margin` metres. */
  static rectsOverlap(a: Building, b: Building, margin = 0): boolean {
    for (const r of [a, b]) {
      for (const axis of [
        { x: Math.cos(r.yaw), z: -Math.sin(r.yaw) },
        { x: Math.sin(r.yaw), z: Math.cos(r.yaw) },
      ]) {
        const project = (q: Building) => {
          const ps = CityLayout.corners(q.x, q.z, q.yaw, q.w + margin, q.d + margin).map((c) => c.x * axis.x + c.z * axis.z)
          return [Math.min(...ps), Math.max(...ps)]
        }
        const [a0, a1] = project(a)
        const [b0, b1] = project(b)
        if (a1 < b0 || b1 < a0) return false
      }
    }
    return true
  }

  /** Distance from a disc's centre to a footprint (0 inside). */
  static rectDiscDistance(b: Building, disc: Disc): number {
    const dx = disc.x - b.x
    const dz = disc.z - b.z
    const lx = Math.cos(b.yaw) * dx - Math.sin(b.yaw) * dz
    const lz = Math.sin(b.yaw) * dx + Math.cos(b.yaw) * dz
    const ex = Math.max(0, Math.abs(lx) - b.w / 2)
    const ez = Math.max(0, Math.abs(lz) - b.d / 2)
    return Math.hypot(ex, ez)
  }
}
