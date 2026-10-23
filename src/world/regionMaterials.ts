import * as THREE from 'three/webgpu'
import { ToonMaterials } from '../render/toon'
import { VegetationModels } from './vegetationModels'

/**
 * The handful of materials every region prop shares (each built once):
 * vertex-coloured toon for solid parts, two glow colours for lit parts
 * (lantern fireboxes and paper windows warm, vending screens and expressway
 * strips cool) and the valley's water.
 */
export class RegionMaterials {
  private static warm: THREE.Material | null = null
  private static cool: THREE.Material | null = null
  private static waterValue: THREE.Material | null = null

  /** White toon × vertex colours × instance tint (the plants' material). */
  static get solid(): THREE.Material {
    return VegetationModels.material
  }

  /** Warm paper-lantern light: blooms at dusk. */
  static get warmGlow(): THREE.Material {
    return (this.warm ??= ToonMaterials.create({ color: '#ffd08a', emissive: '#ffb35a', emissiveIntensity: 2.4, flatShading: false }))
  }

  /** Cool screen light (vending machines, expressway strips). */
  static get coolGlow(): THREE.Material {
    return (this.cool ??= ToonMaterials.create({ color: '#c8f4ff', emissive: '#7fe0ff', emissiveIntensity: 2, flatShading: false }))
  }

  /** Still water: the dusk sky's lilac-blue, faintly lit so it reads in the shade of the valley. */
  static get water(): THREE.Material {
    return (this.waterValue ??= ToonMaterials.create({ color: '#7d8fc4', emissive: '#4a5aa0', emissiveIntensity: 0.35, flatShading: false, bands: 2 }))
  }
}

/**
 * Appends oriented boxes to plain position/normal/uv/colour arrays, for the
 * big merged region meshes (buildings, signs, expressway). Normals point along
 * each corner's diagonal rather than the face, so the outline pass's hull
 * closes round the box; the toon material's flat shading keeps faces faceted.
 */
export class BoxWriter {
  readonly positions: number[] = []
  readonly normals: number[] = []
  readonly uvs: number[] = []
  readonly colors: number[] = []
  readonly indices: number[] = []

  /**
   * A quad from four local corners (counter-clockwise seen from outside), each
   * with its own outline normal, transformed by `m`; `uv` gives u0, v0, u1, v1.
   */
  quad(m: THREE.Matrix4, corners: readonly THREE.Vector3[], normals: readonly THREE.Vector3[], uv: readonly [number, number, number, number], color: THREE.Color): void {
    const base = this.positions.length / 3
    const nm = new THREE.Matrix3().getNormalMatrix(m)
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    const uvAt: [number, number][] = [
      [uv[0], uv[1]],
      [uv[2], uv[1]],
      [uv[2], uv[3]],
      [uv[0], uv[3]],
    ]
    for (let k = 0; k < 4; k++) {
      p.copy(corners[k]).applyMatrix4(m)
      n.copy(normals[k]).applyMatrix3(nm).normalize()
      this.positions.push(p.x, p.y, p.z)
      this.normals.push(n.x, n.y, n.z)
      this.uvs.push(...uvAt[k])
      this.colors.push(color.r, color.g, color.b)
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  /**
   * A box x ∈ ±w/2, y ∈ [0, h], z ∈ ±d/2 in the frame `m`. `faceUv(face)`
   * returns the UV rectangle for each face (+x, −x, +z, −z, top, bottom).
   */
  box(m: THREE.Matrix4, w: number, h: number, d: number, color: THREE.Color, faceUv: (face: number, width: number, height: number) => [number, number, number, number] = () => [0, 0, 1, 1]): void {
    const x = w / 2
    const z = d / 2
    const v = (a: number, b: number, c: number) => new THREE.Vector3(a, b, c)
    const diag = (a: THREE.Vector3) => v(Math.sign(a.x), a.y > 0 ? 1 : -1, Math.sign(a.z))
    const faces: THREE.Vector3[][] = [
      [v(x, 0, z), v(x, 0, -z), v(x, h, -z), v(x, h, z)],
      [v(-x, 0, -z), v(-x, 0, z), v(-x, h, z), v(-x, h, -z)],
      [v(-x, 0, z), v(x, 0, z), v(x, h, z), v(-x, h, z)],
      [v(x, 0, -z), v(-x, 0, -z), v(-x, h, -z), v(x, h, -z)],
      [v(-x, h, z), v(x, h, z), v(x, h, -z), v(-x, h, -z)],
      [v(-x, 0, -z), v(x, 0, -z), v(x, 0, z), v(-x, 0, z)],
    ]
    const size: [number, number][] = [
      [d, h],
      [d, h],
      [w, h],
      [w, h],
      [w, d],
      [w, d],
    ]
    faces.forEach((f, i) => this.quad(m, f, f.map(diag), faceUv(i, ...size[i]), color))
  }

  /** The accumulated geometry (null when nothing was written). */
  geometry(): THREE.BufferGeometry | null {
    if (!this.indices.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3))
    g.setIndex(this.indices)
    g.computeBoundingSphere()
    return g
  }
}
