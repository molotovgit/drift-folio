import type RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { palette } from '../render/palette'
import { ToonMaterials } from '../render/toon'
import type { RoadEdge, RoadNetwork } from './roadNetwork'
import { RIBBON_ROW, RoadSurface, type SurfaceGeometry } from './roadSurface'

// re-exported so layout modules can keep importing it from here
export { leftOf } from './spline'

/**
 * Where several roads meet, their ribbons overlap (and the junction apron lies
 * under them). Each road gets a different small lift near each shared node (by
 * its rank among the roads at that node, apron lowest), fading out over
 * JUNCTION_FADE metres, so overlaps never z-fight.
 */
const JUNCTION_LIFT = 0.018
const JUNCTION_FADE = 16

/**
 * Asphalt ribbons and junction aprons for every road, plus matching trimesh
 * colliders tagged 'road' (see RoadSurface). One canvas texture gives the edge
 * lines and dashed centre line.
 */
export class RoadMesh {
  readonly group = new THREE.Group()
  readonly colliders: RAPIER.Collider[]

  constructor(roads: RoadNetwork, world: RAPIER.World) {
    const material = ToonMaterials.create({ color: '#ffffff', map: RoadMesh.markingsTexture(), flatShading: false })
    const rank = RoadMesh.junctionRanks(roads)
    const parts: THREE.BufferGeometry[] = []
    for (const edge of roads.edges) {
      const ribbon = RoadSurface.ribbon(edge)
      parts.push(RoadMesh.geometry({ ...ribbon, positions: RoadMesh.liftNearJunctions(ribbon.positions, edge, rank.get(edge.id)!) }))
    }
    for (const apron of RoadSurface.aprons(roads)) parts.push(RoadMesh.geometry(apron))
    // the colliders keep the true (un-lifted) surface
    this.colliders = RoadSurface.colliders(roads, world)
    // one mesh for every road keeps it to a single draw call
    const mesh = new THREE.Mesh(mergeGeometries(parts), material)
    mesh.receiveShadow = true
    mesh.name = 'roads'
    this.group.add(mesh)
  }

  /** Each edge's rank among the edges touching its start and end nodes (0 = drawn lowest). */
  static junctionRanks(roads: RoadNetwork): Map<string, { from: number; to: number }> {
    const atNode = new Map<string, string[]>()
    for (const e of roads.edges) {
      for (const n of [e.from, e.to]) {
        const list = atNode.get(n) ?? []
        list.push(e.id)
        atNode.set(n, list)
      }
    }
    const out = new Map<string, { from: number; to: number }>()
    for (const e of roads.edges) out.set(e.id, { from: atNode.get(e.from)!.indexOf(e.id), to: atNode.get(e.to)!.indexOf(e.id) })
    return out
  }

  /** Copy of ribbon positions with the per-junction lift applied near each end (every rank sits above the apron). */
  static liftNearJunctions(positions: Float32Array, edge: RoadEdge, rank: { from: number; to: number }): Float32Array {
    const out = positions.slice()
    const fade = (d: number) => Math.max(0, 1 - d / JUNCTION_FADE)
    for (let i = 0; i < edge.points.length; i++) {
      const lift = JUNCTION_LIFT * ((rank.from + 1) * fade(edge.dist[i]) + (rank.to + 1) * fade(edge.length - edge.dist[i]))
      for (let k = 0; k < RIBBON_ROW; k++) out[(i * RIBBON_ROW + k) * 3 + 1] += lift
    }
    return out
  }

  /** One row of RIBBON_ROW vertices per centreline sample, `width` across, UV v in metres / DASH_PERIOD. */
  static ribbon(edge: RoadEdge): SurfaceGeometry {
    return RoadSurface.ribbon(edge)
  }

  private static geometry({ positions, uvs, indices }: SurfaceGeometry): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geo.setIndex(new THREE.BufferAttribute(indices, 1))
    geo.computeVertexNormals()
    return geo
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
