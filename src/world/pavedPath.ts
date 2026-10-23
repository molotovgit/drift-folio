import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { palette } from '../render/palette'
import { ToonMaterials } from '../render/toon'
import { surfaceOf } from '../vehicle/wheel'
import type { Channel } from './shortcutLayout'

/**
 * A paved strip along a channel (S4's rest-stop cut): asphalt ribbon plus a
 * trimesh collider tagged 'road', so it drives like any other road.
 */
export class PavedPath {
  readonly mesh: THREE.Mesh

  constructor(world: RAPIER.World, path: Channel) {
    const n = path.points.length
    const positions = new Float32Array(n * 2 * 3)
    const half = path.width / 2
    for (let i = 0; i < n; i++) {
      const p = path.points[i]
      const a = path.points[Math.max(0, i - 1)]
      const b = path.points[Math.min(n - 1, i + 1)]
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1
      // left normal of the direction of travel (facing +Z, left is +X)
      const lx = (b.z - a.z) / l
      const lz = -(b.x - a.x) / l
      positions.set([p.x + lx * half, p.y + 0.02, p.z + lz * half, p.x - lx * half, p.y + 0.02, p.z - lz * half], i * 6)
    }
    const indices = new Uint32Array((n - 1) * 6)
    for (let i = 0; i < n - 1; i++) indices.set([i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2], i * 6)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setIndex(new THREE.BufferAttribute(indices, 1))
    geo.computeVertexNormals()
    this.mesh = new THREE.Mesh(geo, ToonMaterials.create({ color: palette.road, flatShading: false }))
    this.mesh.receiveShadow = true
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    const collider = world.createCollider(RAPIER.ColliderDesc.trimesh(positions, indices).setFriction(0.9), body)
    surfaceOf.set(collider.handle, 'road')
  }
}
