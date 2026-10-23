import RAPIER from '@dimforge/rapier3d-compat'
import { surfaceOf } from '../vehicle/wheel'
import { ROAD_WIDTH } from './roadLayout'
import { MEET_RAMP, RoadNetwork } from './roadNetwork'
import type { SurfaceGeometry } from './roadSurface'
import { capsuleDistance, type FlatLot } from './townLayout'

/** spokes of the lot mesh */
const SEGMENTS = 96
/** ring spacing over the flat interior, and over the band where the lot ramps to a street */
const CORE_RING = 2
const EDGE_RING = 1
/** a lot whose rim stops short of a street by less than this is paved across the gap */
const SKIRT = 10
/** the skirt runs this far onto the asphalt, so lot and street overlap */
const SKIRT_OVERLAP = 0.8

/**
 * A paved town lot. Flat at the lot's height, except where a street crosses or
 * touches it: there the lot takes the street's own surface and ramps smoothly
 * back to its height, so rolling between lot and street never meets a step
 * (the streets slope and bank; a flat disc cannot match them). The ramp always
 * ends before the lot's usable area (skidpad ring, cone course), which stays
 * dead flat. Where the rim falls just short of a street, the lot is paved out
 * to the asphalt so there is no strip of lower ground to drop into.
 */
export class LotSurface {
  /** one surface per lot and road network, shared by the terrain (which flattens under it) and the town (which draws it) */
  private static readonly shared = new WeakMap<RoadNetwork, Map<FlatLot, LotSurface>>()
  /** outer radius along each mesh spoke (the lot radius, or out to a nearby street) */
  private readonly reach: number[]
  /** every spoke is flat at the lot's height out to this radius */
  readonly flatRadius: number
  private mesh?: SurfaceGeometry

  /** The shared surface of a lot. */
  static of(lot: FlatLot, roads: RoadNetwork): LotSurface {
    let lots = LotSurface.shared.get(roads)
    if (!lots) LotSurface.shared.set(roads, (lots = new Map()))
    let surface = lots.get(lot)
    if (!surface) lots.set(lot, (surface = new LotSurface(lot, roads)))
    return surface
  }

  private constructor(
    readonly lot: FlatLot,
    private readonly roads: RoadNetwork,
  ) {
    // each spoke reaches as far as its neighbours do, so the outline between a skirted spoke and a plain one never leaves a wedge of ground
    const raw = Array.from({ length: SEGMENTS }, (_, s) => this.spokeReach(LotSurface.angle(s)))
    this.reach = raw.map((r, s) => Math.max(r, raw[(s + 1) % SEGMENTS], raw[(s + SEGMENTS - 1) % SEGMENTS]))
    this.flatRadius = this.measureFlatRadius()
  }

  /** Paved height at world (x, z) (meaningful inside the lot's outline). */
  heightAt(x: number, z: number): number {
    const m = this.roads.meeting(x, z)
    if (!m) return this.lot.y
    const usable = this.lot.usable ? capsuleDistance(this.lot.usable, x, z) : Infinity
    if (usable === 0) return this.lot.y
    // ramp over MEET_RAMP, or over whatever room is left before the usable area if that is less
    return RoadNetwork.blendMeet(m.roadY, this.lot.y, Math.max(m.past / MEET_RAMP, m.past / (m.past + usable)))
  }

  /** Whether (x, z) lies on the lot (its disc plus any skirt to a street), with an extra margin in metres. */
  contains(x: number, z: number, margin = 0): boolean {
    const dx = x - this.lot.x
    const dz = z - this.lot.z
    const a = (Math.atan2(dz, dx) + Math.PI * 2) % (Math.PI * 2)
    const f = (a / (Math.PI * 2)) * SEGMENTS
    const s = Math.floor(f) % SEGMENTS
    const r = this.reach[s] + (this.reach[(s + 1) % SEGMENTS] - this.reach[s]) * (f - Math.floor(f))
    return Math.hypot(dx, dz) < r + margin
  }

  /**
   * Polar mesh of the lot (built once): coarse rings over the flat interior,
   * fine rings over the band out to each spoke's reach where it ramps to the
   * streets. UVs are planar (0..1 across the disc) like THREE.CircleGeometry.
   */
  geometry(): SurfaceGeometry {
    return (this.mesh ??= this.build())
  }

  private build(): SurfaceGeometry {
    const { x: cx, z: cz, r } = this.lot
    const core = Math.max(1, Math.round(this.flatRadius / CORE_RING))
    const band = Math.max(1, Math.ceil((Math.max(...this.reach) - this.flatRadius) / EDGE_RING))
    const rings = core + band
    // ring k's radius along spoke s: even steps to the flat radius, then even steps out to the spoke's reach
    const radius = (k: number, s: number) =>
      k <= core ? (k / core) * this.flatRadius : this.flatRadius + ((k - core) / band) * (this.reach[s] - this.flatRadius)
    const count = 1 + rings * SEGMENTS
    const positions = new Float32Array(count * 3)
    const uvs = new Float32Array(count * 2)
    const put = (k: number, x: number, z: number) => {
      positions.set([x, this.heightAt(x, z), z], k * 3)
      // CircleGeometry lies in XY and is rotated -90° about X, so its v runs along −Z
      uvs.set([(x - cx) / (2 * r) + 0.5, -(z - cz) / (2 * r) + 0.5], k * 2)
    }
    put(0, cx, cz)
    for (let ring = 1; ring <= rings; ring++) {
      for (let s = 0; s < SEGMENTS; s++) {
        const a = LotSurface.angle(s)
        const rr = radius(ring, s)
        put(1 + (ring - 1) * SEGMENTS + s, cx + Math.cos(a) * rr, cz + Math.sin(a) * rr)
      }
    }
    const idx = (ring: number, s: number) => (ring === 0 ? 0 : 1 + (ring - 1) * SEGMENTS + (s % SEGMENTS))
    const tris: number[] = []
    // angle grows from +X toward +Z (clockwise seen from above): (inner, outer next, outer) keeps normals up
    for (let s = 0; s < SEGMENTS; s++) tris.push(0, idx(1, s + 1), idx(1, s))
    for (let ring = 1; ring < rings; ring++) {
      for (let s = 0; s < SEGMENTS; s++) {
        const a = idx(ring, s)
        const b = idx(ring, s + 1)
        const c = idx(ring + 1, s)
        const d = idx(ring + 1, s + 1)
        tris.push(a, d, c, a, b, d)
      }
    }
    return { positions, uvs, indices: new Uint32Array(tris) }
  }

  /** Largest radius (less a metre of margin) inside which every spoke is still flat. */
  private measureFlatRadius(): number {
    let flat = Infinity
    for (let s = 0; s < SEGMENTS; s++) {
      const a = LotSurface.angle(s)
      let d = 0
      while (d < this.reach[s] && Math.abs(this.heightAt(this.lot.x + Math.cos(a) * d, this.lot.z + Math.sin(a) * d) - this.lot.y) < 1e-4) d += 0.5
      flat = Math.min(flat, d)
    }
    return Math.max(CORE_RING, flat - 1)
  }

  private static angle(s: number): number {
    return (s / SEGMENTS) * Math.PI * 2
  }

  /** The lot radius, or — if a street's asphalt starts within SKIRT of the rim along this direction — out onto it. */
  private spokeReach(angle: number): number {
    const { x, z, r } = this.lot
    const onAsphalt = (d: number) => this.roads.index.nearest(x + Math.cos(angle) * d, z + Math.sin(angle) * d, ROAD_WIDTH / 2 - SKIRT_OVERLAP) !== null
    if (onAsphalt(r)) return r
    for (let d = r; d <= r + SKIRT; d += 0.25) if (onAsphalt(d)) return d + SKIRT_OVERLAP
    return r
  }

  /** Fixed trimesh colliders tagged 'road' for each lot, so driving on them never counts as off-road. */
  static colliders(world: RAPIER.World, lots: readonly LotSurface[]): RAPIER.Collider[] {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    return lots.map((l) => {
      const { positions, indices } = l.geometry()
      const desc = RAPIER.ColliderDesc.trimesh(positions, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(0.9)
      const collider = world.createCollider(desc, body)
      surfaceOf.set(collider.handle, 'road')
      return collider
    })
  }
}
