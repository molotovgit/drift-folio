import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { palette } from '../render/palette'
import { ToonMaterials } from '../render/toon'
import { surfaceOf } from '../vehicle/wheel'
import { leftOf } from './roadMesh'
import type { RoadEdge, RoadNetwork } from './roadNetwork'

/** Curves tighter than this get a rail on the outside (plan Task 3.3). */
export const RAIL_MAX_RADIUS = 60
/** distance from centreline to the rail face */
const RAIL_OFFSET = 4.7
const POST_SPACING = 4
const BEAM_LOW = 0.45
const BEAM_HIGH = 0.78
/** rails are skipped on these routes (town street has kerbs, not rails) */
const NO_RAIL_ROUTES = new Set(['town'])

/** A run of consecutive samples on one side of an edge that needs a rail. */
export interface RailRun {
  edge: RoadEdge
  from: number
  to: number
  /** +1 = rail on the left of travel, -1 = on the right */
  side: 1 | -1
}

/**
 * W-beam guard rails on the outside of curves: instanced posts, a beam
 * ribbon, and a thin wall collider tagged 'rail' (the crash rule in M4 listens
 * for hard contacts with it).
 */
export class GuardRails {
  readonly group = new THREE.Group()
  readonly runs: RailRun[]
  readonly colliders: RAPIER.Collider[] = []

  constructor(
    roads: RoadNetwork,
    world: RAPIER.World,
    /** deliberate breaks in the rail (S3 "broken rail" shortcut) */
    gaps: readonly { x: number; z: number; r: number }[] = [],
  ) {
    this.runs = roads.edges
      .filter((e) => !NO_RAIL_ROUTES.has(e.route))
      .flatMap((e) => GuardRails.findRuns(e))
      .flatMap((run) => GuardRails.splitAtGaps(run, gaps))
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    const beamMat = ToonMaterials.create({ color: palette.rail, flatShading: false, side: THREE.DoubleSide })
    const posts: THREE.Matrix4[] = []
    const beams: THREE.BufferGeometry[] = []
    for (const run of this.runs) {
      const { positions, indices, postAt } = GuardRails.runGeometry(run)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geo.setIndex(new THREE.BufferAttribute(indices, 1))
      geo.computeVertexNormals()
      beams.push(geo)
      posts.push(...postAt)
      // collider: a taller wall than the visible beam so cars can't hop it
      const wall = GuardRails.runGeometry(run, -0.3, 1.1)
      const collider = world.createCollider(RAPIER.ColliderDesc.trimesh(wall.positions, wall.indices).setFriction(0.25).setRestitution(0.2), body)
      surfaceOf.set(collider.handle, 'rail')
      this.colliders.push(collider)
    }
    // all beams in one mesh: a single draw call for every rail on the mountain
    const beam = new THREE.Mesh(mergeGeometries(beams), beamMat)
    beam.castShadow = true
    this.group.add(beam)
    const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.85, 0.12).translate(0, 0.42, 0), ToonMaterials.create({ color: palette.metalDark }), posts.length)
    posts.forEach((m, i) => postMesh.setMatrixAt(i, m))
    postMesh.castShadow = true
    this.group.add(postMesh)
  }

  /** Split an edge into rail runs: contiguous samples with |radius| < RAIL_MAX_RADIUS, outside of the turn. */
  static findRuns(edge: RoadEdge): RailRun[] {
    const runs: RailRun[] = []
    let start = -1
    let side: 1 | -1 = 1
    const flush = (end: number) => {
      // pad a few samples so the rail starts before the corner
      if (start >= 0 && end - start >= 3) runs.push({ edge, from: Math.max(0, start - 4), to: Math.min(edge.points.length - 1, end + 4), side })
      start = -1
    }
    for (let i = 0; i < edge.points.length; i++) {
      const r = edge.radius[i]
      const tight = Math.abs(r) < RAIL_MAX_RADIUS
      // turning left (r > 0) → outside is the right side
      const s: 1 | -1 = r > 0 ? -1 : 1
      if (tight && start < 0) {
        start = i
        side = s
      } else if ((!tight || s !== side) && start >= 0) {
        flush(i - 1)
        if (tight) {
          start = i
          side = s
        }
      }
    }
    flush(edge.points.length - 1)
    return runs
  }

  /** Remove the samples of a run that fall inside any gap, splitting it in two if needed. */
  static splitAtGaps(run: RailRun, gaps: readonly { x: number; z: number; r: number }[]): RailRun[] {
    if (!gaps.length) return [run]
    const out: RailRun[] = []
    let from = -1
    for (let i = run.from; i <= run.to; i++) {
      const p = run.edge.points[i]
      const inGap = gaps.some((g) => Math.hypot(p.x - g.x, p.z - g.z) < g.r)
      if (!inGap && from < 0) from = i
      if ((inGap || i === run.to) && from >= 0) {
        const to = inGap ? i - 1 : i
        if (to - from >= 2) out.push({ ...run, from, to })
        from = -1
      }
    }
    return out
  }

  /** Vertical strip between `low` and `high` metres above the road along a run, plus post transforms. */
  static runGeometry(run: RailRun, low = BEAM_LOW, high = BEAM_HIGH) {
    const { edge, from, to, side } = run
    const count = to - from + 1
    const positions = new Float32Array(count * 2 * 3)
    const postAt: THREE.Matrix4[] = []
    let lastPost = -Infinity
    for (let k = 0; k < count; k++) {
      const i = from + k
      const p = edge.points[i]
      const t = edge.tangent(i)
      const l = leftOf(t.x, t.y)
      const x = p.x + l.x * RAIL_OFFSET * side
      const z = p.z + l.z * RAIL_OFFSET * side
      // the rail stands on the (possibly junction-banked) surface at its offset
      const y = edge.surfaceY(i, RAIL_OFFSET * side)
      positions.set([x, y + low, z, x, y + high, z], k * 6)
      if (edge.dist[i] - lastPost >= POST_SPACING) {
        postAt.push(new THREE.Matrix4().makeTranslation(x, y - 0.05, z))
        lastPost = edge.dist[i]
      }
    }
    const indices = new Uint32Array((count - 1) * 6)
    for (let k = 0; k < count - 1; k++) {
      const a = k * 2
      indices.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], k * 6)
    }
    return { positions, indices, postAt }
  }
}
