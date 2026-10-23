import RAPIER from '@dimforge/rapier3d-compat'
import type { Vec3 } from '../core/math'
import { surfaceOf } from '../vehicle/wheel'
import type { NodeFrame } from './roadJunctions'
import type { RoadEdge, RoadNetwork } from './roadNetwork'
import { leftOf } from './spline'

/** Texture repeats every this many metres along the road. */
export const DASH_PERIOD = 8
/** quads across a road ribbon, and vertices per ribbon row */
export const RIBBON_ACROSS = 4
export const RIBBON_ROW = RIBBON_ACROSS + 1
/** segments of each junction apron disc */
const APRON_SEGMENTS = 32
/** apron u: plain asphalt between the texture's edge lines and centre dash */
const APRON_U = 0.3
/** corners between neighbouring roads narrower than this get a fillet (wider ones are outside corners) */
export const FILLET_MAX_GAP = (160 * Math.PI) / 180
/** a fillet reaches at most this far out along each road */
export const FILLET_REACH = 12
/**
 * Trimesh flags for road colliders: merge the strip's shared vertices and fix
 * internal edges, so a chassis sliding across the asphalt never catches on a
 * triangle seam (ghost collisions).
 */
const ROAD_TRIMESH_FLAGS = RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES

export interface SurfaceGeometry {
  positions: Float32Array
  uvs: Float32Array
  indices: Uint32Array
}

/**
 * The drivable asphalt as plain geometry (no rendering): one ribbon per road
 * edge plus a disc "apron" at every node, lying on the node's junction plane,
 * which fills the wedges between ribbon ends where roads meet at an angle.
 * Shared by the visible road mesh and the physics colliders.
 */
export class RoadSurface {
  /**
   * RIBBON_ROW vertices per centreline sample, left edge to right edge across
   * `width` on the banked surface; UV u across, v in metres / DASH_PERIOD.
   * Several quads across (not one) keep the surface smooth through hairpins,
   * where the inner edge is far steeper than the outer one and a single wide
   * quad would twist into a crease a tyre feels.
   */
  static ribbon(edge: RoadEdge): SurfaceGeometry {
    const n = edge.points.length
    const positions = new Float32Array(n * RIBBON_ROW * 3)
    const uvs = new Float32Array(n * RIBBON_ROW * 2)
    const half = edge.width / 2
    for (let i = 0; i < n; i++) {
      const p: Vec3 = edge.points[i]
      const t = edge.tangent(i)
      const l = leftOf(t.x, t.y)
      const v = edge.dist[i] / DASH_PERIOD
      for (let k = 0; k < RIBBON_ROW; k++) {
        const u = k / RIBBON_ACROSS
        const off = half - u * edge.width
        positions.set([p.x + l.x * off, edge.surfaceY(i, off), p.z + l.z * off], (i * RIBBON_ROW + k) * 3)
        uvs.set([u, v], (i * RIBBON_ROW + k) * 2)
      }
    }
    const indices = new Uint32Array((n - 1) * RIBBON_ACROSS * 6)
    let q = 0
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < RIBBON_ACROSS; k++) {
        const a = i * RIBBON_ROW + k
        const next = a + RIBBON_ROW
        // counter-clockwise seen from above, so normals point up
        indices.set([a, a + 1, next, a + 1, next + 1, next], q)
        q += 6
      }
    }
    return { positions, uvs, indices }
  }

  /**
   * Disc on the node's plane covering the swept width around the node. Its
   * polygon circumscribes a circle of half the road width, so it reaches every
   * ribbon end corner (ribbons hold the same plane there).
   */
  static apron(frame: NodeFrame, width: number): SurfaceGeometry {
    const r = width / 2 / Math.cos(Math.PI / APRON_SEGMENTS)
    const { x, z } = frame.pos
    const positions = new Float32Array((APRON_SEGMENTS + 1) * 3)
    const uvs = new Float32Array((APRON_SEGMENTS + 1) * 2)
    positions.set([x, frame.heightAt(x, z), z], 0)
    uvs.set([APRON_U, 0], 0)
    for (let k = 0; k < APRON_SEGMENTS; k++) {
      const a = (k / APRON_SEGMENTS) * Math.PI * 2
      const vx = x + Math.cos(a) * r
      const vz = z + Math.sin(a) * r
      positions.set([vx, frame.heightAt(vx, vz), vz], (k + 1) * 3)
      uvs.set([APRON_U, 0.1], (k + 1) * 2)
    }
    const indices = new Uint32Array(APRON_SEGMENTS * 3)
    // angle grows from +X toward +Z, which is clockwise seen from above: centre, next, this keeps normals up
    for (let k = 0; k < APRON_SEGMENTS; k++) indices.set([0, 1 + ((k + 1) % APRON_SEGMENTS), 1 + k], k * 3)
    return { positions, uvs, indices }
  }

  /** Every node's junction paving (aprons and fillets) as one list. */
  static aprons(roads: RoadNetwork): SurfaceGeometry[] {
    const { aprons, fillets } = RoadSurface.junctionPaving(roads)
    return [...aprons, ...fillets]
  }

  /**
   * Every node's junction paving: the apron disc plus a fillet in each corner
   * between neighbouring roads (sorted by direction around the node). Kept
   * apart because fillets overlap the apron on the same plane (the mesh draws
   * them a hair higher).
   */
  static junctionPaving(roads: RoadNetwork): { aprons: SurfaceGeometry[]; fillets: SurfaceGeometry[] } {
    const aprons: SurfaceGeometry[] = []
    const fillets: SurfaceGeometry[] = []
    for (const n of roads.nodes) {
      const frame = roads.junction(n.id)
      aprons.push(RoadSurface.apron(frame, roads.edges[0]?.width ?? 8))
      const ends = roads.edges
        .flatMap((edge) => [...(edge.from === n.id ? [{ edge, atStart: true }] : []), ...(edge.to === n.id ? [{ edge, atStart: false }] : [])])
        .map((end) => ({ ...end, angle: RoadSurface.outwardAngle(end.edge, end.atStart) }))
        .sort((a, b) => a.angle - b.angle)
      if (ends.length < 2) continue
      for (let k = 0; k < ends.length; k++) {
        const a = ends[k]
        const b = ends[(k + 1) % ends.length]
        const gap = (b.angle - a.angle + Math.PI * 2) % (Math.PI * 2)
        if (gap > 0 && gap < FILLET_MAX_GAP) fillets.push(RoadSurface.fillet(frame, a, b))
      }
    }
    return { aprons, fillets }
  }

  /**
   * Paving for the inner corner between two roads leaving a node: a fan from
   * the node over the facing edges of both ribbons out to where they still
   * hold the node plane, closed by a chord. A car cutting the corner stays on
   * asphalt, and everything lies on the node plane, so nothing steps.
   */
  static fillet(frame: NodeFrame, a: { edge: RoadEdge; atStart: boolean }, b: { edge: RoadEdge; atStart: boolean }): SurfaceGeometry {
    const reach = Math.min(FILLET_REACH, frame.hold(a.edge.id, a.atStart), frame.hold(b.edge.id, b.atStart))
    // the corner lies on a's side rotated from +X toward +Z, and b's opposite side. Leaving the node
    // that is right of travel for a (left for b); arriving, travel is reversed and so are the sides
    const sideA = a.atStart ? -1 : 1
    const sideB = b.atStart ? 1 : -1
    const edgeA = RoadSurface.edgeLine(a.edge, a.atStart, sideA, reach)
    const edgeB = RoadSurface.edgeLine(b.edge, b.atStart, sideB, reach)
    const { x, z } = frame.pos
    const verts: Vec3[] = [{ x, y: frame.heightAt(x, z), z }, ...edgeA, ...edgeB]
    const tris: number[] = []
    const ia = (k: number) => 1 + k
    const ib = (k: number) => 1 + edgeA.length + k
    for (let k = 0; k < edgeA.length - 1; k++) tris.push(0, ia(k), ia(k + 1))
    tris.push(0, ia(edgeA.length - 1), ib(edgeB.length - 1))
    for (let k = edgeB.length - 1; k > 0; k--) tris.push(0, ib(k), ib(k - 1))
    return RoadSurface.upward(verts, tris)
  }

  /** Direction a road leaves a node in, as an angle from +X toward +Z. */
  private static outwardAngle(edge: RoadEdge, atStart: boolean): number {
    const n = edge.points.length
    const [p, q] = atStart ? [edge.points[0], edge.points[1]] : [edge.points[n - 1], edge.points[n - 2]]
    return Math.atan2(q.z - p.z, q.x - p.x)
  }

  /** Vertices along one edge of a ribbon (side +1 = left of travel), from the node out to `reach` metres. */
  private static edgeLine(edge: RoadEdge, atStart: boolean, side: number, reach: number): Vec3[] {
    const half = (edge.width / 2) * side
    const out: Vec3[] = []
    const n = edge.points.length
    for (let k = 0; k < n; k++) {
      const i = atStart ? k : n - 1 - k
      if ((atStart ? edge.dist[i] : edge.length - edge.dist[i]) > reach) break
      const p = edge.points[i]
      const l = leftOf(edge.tangent(i).x, edge.tangent(i).y)
      out.push({ x: p.x + l.x * half, y: edge.surfaceY(i, half), z: p.z + l.z * half })
    }
    return out
  }

  /** Geometry from loose triangles, each wound so its normal points up. */
  private static upward(verts: Vec3[], tris: number[]): SurfaceGeometry {
    const positions = new Float32Array(verts.length * 3)
    const uvs = new Float32Array(verts.length * 2)
    verts.forEach((v, k) => {
      positions.set([v.x, v.y, v.z], k * 3)
      uvs.set([APRON_U, 0.2], k * 2)
    })
    for (let t = 0; t < tris.length; t += 3) {
      const [a, b, c] = [verts[tris[t]], verts[tris[t + 1]], verts[tris[t + 2]]]
      // y of (b − a) × (c − a): negative means the normal points down
      const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)
      if (ny < 0) [tris[t + 1], tris[t + 2]] = [tris[t + 2], tris[t + 1]]
    }
    return { positions, uvs, indices: new Uint32Array(tris) }
  }

  /** Fixed trimesh colliders tagged 'road' for every ribbon and every junction's paving. */
  static colliders(roads: RoadNetwork, world: RAPIER.World): RAPIER.Collider[] {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    const parts = [...roads.edges.map((e) => RoadSurface.ribbon(e)), ...RoadSurface.aprons(roads)]
    return parts.map(({ positions, indices }) => {
      const collider = world.createCollider(RAPIER.ColliderDesc.trimesh(positions, indices, ROAD_TRIMESH_FLAGS).setFriction(0.9), body)
      surfaceOf.set(collider.handle, 'road')
      return collider
    })
  }
}
