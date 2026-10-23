import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { palette } from '../render/palette'
import { ToonMaterials } from '../render/toon'
import { surfaceOf } from '../vehicle/wheel'
import type { RoadNetwork } from './roadNetwork'
import { densify, type Channel } from './shortcutLayout'

/** the strip is rebuilt at this spacing so it can follow the road surface where it joins */
const STEP = 1
/** quads across the strip's width */
const ACROSS = 6
/** the visible strip sits this far above its collider (no z-fight with the terrain carve) */
const VISUAL_LIFT = 0.02

/**
 * A paved strip along a channel (S4's rest-stop cut): asphalt ribbon plus a
 * trimesh collider tagged 'road', so it drives like any other road. Where it
 * joins a road it takes that road's surface (RoadNetwork.meet), so the car
 * rolls on and off it without a step.
 */
export class PavedPath {
  readonly mesh: THREE.Mesh

  constructor(world: RAPIER.World, path: Channel, roads: RoadNetwork) {
    const { positions, indices } = PavedPath.geometry(path, roads)
    const visual = positions.slice()
    for (let i = 1; i < visual.length; i += 3) visual[i] += VISUAL_LIFT
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(visual, 3))
    geo.setIndex(new THREE.BufferAttribute(indices, 1))
    geo.computeVertexNormals()
    this.mesh = new THREE.Mesh(geo, ToonMaterials.create({ color: palette.road, flatShading: false }))
    this.mesh.receiveShadow = true
    PavedPath.collider(world, path, roads)
  }

  /**
   * A grid of ACROSS + 1 vertices per metre along the channel, `width` wide,
   * meeting the roads it touches. The ramp onto a road is curved, so the strip
   * needs vertices across its width, not just at its two edges.
   */
  static geometry(path: Channel, roads: RoadNetwork): { positions: Float32Array; indices: Uint32Array } {
    const pts = densify(path.points, STEP)
    const n = pts.length
    const row = ACROSS + 1
    const positions = new Float32Array(n * row * 3)
    const half = path.width / 2
    for (let i = 0; i < n; i++) {
      const p = pts[i]
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(n - 1, i + 1)]
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1
      // left normal of the direction of travel (facing +Z, left is +X)
      const lx = (b.z - a.z) / l
      const lz = -(b.x - a.x) / l
      for (let k = 0; k < row; k++) {
        const off = half - (k / ACROSS) * path.width
        const x = p.x + lx * off
        const z = p.z + lz * off
        positions.set([x, roads.meet(x, z, p.y), z], (i * row + k) * 3)
      }
    }
    const indices = new Uint32Array((n - 1) * ACROSS * 6)
    let t = 0
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < ACROSS; k++) {
        const a = i * row + k
        // left → right across, forward along: same winding as the road ribbons (normals up)
        indices.set([a, a + 1, a + row, a + 1, a + row + 1, a + row], t)
        t += 6
      }
    }
    return { positions, indices }
  }

  /** The strip's fixed trimesh collider, tagged 'road'. */
  static collider(world: RAPIER.World, path: Channel, roads: RoadNetwork): RAPIER.Collider {
    const { positions, indices } = PavedPath.geometry(path, roads)
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    const desc = RAPIER.ColliderDesc.trimesh(positions, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(0.9)
    const collider = world.createCollider(desc, body)
    surfaceOf.set(collider.handle, 'road')
    return collider
  }
}
