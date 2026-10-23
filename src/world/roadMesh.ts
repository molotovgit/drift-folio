import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Vec3 } from '../core/math'
import { palette } from '../render/palette'
import { ToonMaterials } from '../render/toon'
import { surfaceOf } from '../vehicle/wheel'
import type { RoadEdge, RoadNetwork } from './roadNetwork'

/** Texture repeats every this many metres along the road. */
const DASH_PERIOD = 8

/** Left-hand unit normal (x, z) of a horizontal tangent: facing +Z, left is +X. */
export const leftOf = (tx: number, tz: number) => ({ x: tz, z: -tx })

/**
 * Asphalt ribbons for every road plus matching trimesh colliders tagged 'road'.
 * One canvas texture gives the edge lines and dashed centre line.
 */
export class RoadMesh {
  readonly group = new THREE.Group()
  readonly colliders: RAPIER.Collider[] = []

  constructor(roads: RoadNetwork, world: RAPIER.World) {
    const material = ToonMaterials.create({ color: '#ffffff', map: RoadMesh.markingsTexture(), flatShading: false })
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    const parts: THREE.BufferGeometry[] = []
    for (const edge of roads.edges) {
      const { positions, uvs, indices } = RoadMesh.ribbon(edge)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
      geo.setIndex(new THREE.BufferAttribute(indices, 1))
      geo.computeVertexNormals()
      parts.push(geo)
      const collider = world.createCollider(RAPIER.ColliderDesc.trimesh(positions, indices).setFriction(0.9), body)
      surfaceOf.set(collider.handle, 'road')
      this.colliders.push(collider)
    }
    // one mesh for every road keeps it to a single draw call
    const mesh = new THREE.Mesh(mergeGeometries(parts), material)
    mesh.receiveShadow = true
    mesh.name = 'roads'
    this.group.add(mesh)
  }

  /** Two vertices per centreline sample, `width` apart, UV v in metres / DASH_PERIOD. */
  static ribbon(edge: RoadEdge): { positions: Float32Array; uvs: Float32Array; indices: Uint32Array } {
    const n = edge.points.length
    const positions = new Float32Array(n * 2 * 3)
    const uvs = new Float32Array(n * 2 * 2)
    const half = edge.width / 2
    for (let i = 0; i < n; i++) {
      const p: Vec3 = edge.points[i]
      const t = edge.tangent(i)
      const l = leftOf(t.x, t.y)
      positions.set([p.x + l.x * half, p.y, p.z + l.z * half, p.x - l.x * half, p.y, p.z - l.z * half], i * 6)
      const v = edge.dist[i] / DASH_PERIOD
      uvs.set([0, v, 1, v], i * 4)
    }
    const indices = new Uint32Array((n - 1) * 6)
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2
      indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6)
    }
    return { positions, uvs, indices }
  }

  /** Asphalt with white edge lines and a dashed centre line (u across, v along). */
  private static markingsTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 256
    const g = c.getContext('2d')!
    g.fillStyle = palette.road
    g.fillRect(0, 0, 64, 256)
    g.fillStyle = palette.roadLine
    g.fillRect(3, 0, 3, 256) // edge lines
    g.fillRect(58, 0, 3, 256)
    g.fillRect(31, 0, 2, 140) // centre dash: about 4.4 m of every 8 m
    const tex = new THREE.CanvasTexture(c)
    tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }
}
