import RAPIER from '@dimforge/rapier3d-compat'
import { surfaceOf } from '../vehicle/wheel'
import { ROAD_WIDTH } from './roadLayout'
import type { RoadNetwork } from './roadNetwork'
import type { SurfaceGeometry } from './roadSurface'
import type { FlatLot } from './townLayout'

/** radial and angular resolution of the lot mesh */
const RING_SPACING = 1
const SEGMENTS = 192
/** a lot whose rim stops short of a street by less than this is paved across the gap */
const SKIRT = 10
/** the skirt runs this far onto the asphalt, so lot and street overlap */
const SKIRT_OVERLAP = 0.8

/**
 * A paved town lot. Flat at the lot's height, except where a street crosses or
 * touches it: there the lot takes the street's own surface and ramps smoothly
 * back to its height, so rolling between lot and street never meets a step
 * (the streets slope and bank; a flat disc cannot match them). Where the rim
 * falls just short of a street, the lot is paved out to the asphalt so there is
 * no strip of lower ground to drop into.
 */
export class LotSurface {
  /** outer radius along each mesh spoke (the lot radius, or out to a nearby street) */
  private readonly reach: number[]

  constructor(
    readonly lot: FlatLot,
    private readonly roads: RoadNetwork,
  ) {
    // each spoke reaches as far as its neighbours do, so the outline between a skirted spoke and a plain one never leaves a wedge of ground
    const raw = Array.from({ length: SEGMENTS }, (_, s) => this.spokeReach((s / SEGMENTS) * Math.PI * 2))
    this.reach = raw.map((r, s) => Math.max(r, raw[(s + 1) % SEGMENTS], raw[(s + SEGMENTS - 1) % SEGMENTS]))
  }

  /** Paved height at world (x, z) (meaningful inside the lot's outline). */
  heightAt(x: number, z: number): number {
    return this.roads.meet(x, z, this.lot.y)
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

  /** Polar disc mesh of the lot; UVs are planar (0..1 across the disc) like THREE.CircleGeometry. */
  geometry(): SurfaceGeometry {
    const { x: cx, z: cz, r } = this.lot
    const rings = Math.max(2, Math.ceil((r + SKIRT) / RING_SPACING))
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
        const a = (s / SEGMENTS) * Math.PI * 2
        const rr = (ring / rings) * this.reach[s]
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
