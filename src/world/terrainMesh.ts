import * as THREE from 'three/webgpu'
import { ToonMaterials } from '../render/toon'
import { GroundPaint } from './groundPaint'
import type { TerrainHeights } from './terrain'

/**
 * Visible terrain built from the height grid. Vertex colours (from
 * `GroundPaint`) paint maroon ground with patches of dry grass and orange leaf
 * litter, dirt shoulders, canopy shade and darker violet on steep slopes, so
 * the hillsides read like the autumn reference without textures.
 */
export class TerrainMesh {
  readonly mesh: THREE.Mesh

  constructor(terrain: TerrainHeights, paint = new GroundPaint()) {
    const n = terrain.cells + 1
    const { minX, minZ, size } = terrain.bounds
    const positions = new Float32Array(n * n * 3)
    const colors = new Float32Array(n * n * 3)
    const tmp = new THREE.Color()
    const cell = terrain.cellSize

    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const i = iz * n + ix
        const x = minX + (ix / terrain.cells) * size
        const z = minZ + (iz / terrain.cells) * size
        const y = terrain.heights[i]
        positions.set([x, y, z], i * 3)
        // slope from neighbouring heights (rise per metre)
        const hx = terrain.heights[iz * n + Math.min(ix + 1, n - 1)] - terrain.heights[iz * n + Math.max(ix - 1, 0)]
        const hz = terrain.heights[Math.min(iz + 1, n - 1) * n + ix] - terrain.heights[Math.max(iz - 1, 0) * n + ix]
        const slope = Math.hypot(hx, hz) / (2 * cell)
        paint.colorAt(x, z, slope, tmp)
        colors.set([tmp.r, tmp.g, tmp.b], i * 3)
      }
    }

    const index = new Uint32Array(terrain.cells * terrain.cells * 6)
    let k = 0
    for (let iz = 0; iz < terrain.cells; iz++) {
      for (let ix = 0; ix < terrain.cells; ix++) {
        const a = iz * n + ix
        const b = a + 1
        const c = a + n
        const d = c + 1
        index.set([a, c, b, b, c, d], k)
        k += 6
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setIndex(new THREE.BufferAttribute(index, 1))
    geo.computeVertexNormals()
    geo.computeBoundingSphere()

    const mat = ToonMaterials.create({ color: '#ffffff', vertexColors: true, flatShading: false })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.receiveShadow = true
    this.mesh.name = 'terrain'
  }
}
