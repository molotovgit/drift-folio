import * as THREE from 'three/webgpu'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { palette } from '../render/palette'
import { ToonMaterials } from '../render/toon'
import { mulberry32 } from './dressing'

/**
 * Accumulates low-poly primitives into one vertex-coloured geometry. Each part
 * gets a vertical colour ramp (`bottom` at its base, `top` at its tip), which
 * the toon bands turn into a painted, cel-shaded look without textures.
 */
class PlantBuilder {
  private readonly parts: THREE.BufferGeometry[] = []
  private readonly bottom = new THREE.Color()
  private readonly top = new THREE.Color()

  /** Add `geo` (already in its local pose) transformed by `matrix`, coloured bottom → top. */
  add(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, bottom: string, top = bottom): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    g.deleteAttribute('uv')
    g.deleteAttribute('normal')
    g.computeBoundingBox()
    const { min, max } = g.boundingBox!
    const span = max.y - min.y || 1
    const pos = g.getAttribute('position')
    const colors = new Float32Array(pos.count * 3)
    this.bottom.set(bottom)
    this.top.set(top)
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      c.copy(this.bottom).lerp(this.top, (pos.getY(i) - min.y) / span)
      colors.set([c.r, c.g, c.b], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.applyMatrix4(matrix)
    this.parts.push(g)
    geo.dispose()
    return this
  }

  /**
   * Merge, weld and give smooth normals: the outline pass pushes vertices out
   * along their normals, so split normals would crack the ink hull. The toon
   * material's flat shading keeps the faces faceted.
   */
  build(name: string, material: THREE.Material): THREE.Group {
    const merged = mergeGeometries(this.parts)
    for (const p of this.parts) p.dispose()
    const welded = mergeVertices(merged, 1e-4)
    welded.computeVertexNormals()
    welded.computeBoundingSphere()
    const mesh = new THREE.Mesh(welded, material)
    mesh.name = name
    const group = new THREE.Group()
    group.name = name
    group.add(mesh)
    return group
  }
}

/**
 * Transform from position, Euler rotation (radians, applied Z then X then Y) and
 * per-axis scale. A negative `rz` tips +Y towards +X; `ry = -a` then swings that
 * lean to the direction (cos a, sin a), so `pose(.., 0, -a, -lean)` leans outwards.
 */
function pose(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz))
}

/** A thin three-sided blade, base at the origin, tip at +Y. */
const blade = (height: number, radius: number) => new THREE.ConeGeometry(radius, height, 3, 1, true).translate(0, height / 2, 0)

/**
 * Procedural low-poly roadside plants and small props (Blender is not part of
 * the build machine, so these are built at load time instead of shipped as
 * .glb). Every model is ONE mesh with vertex colours and the shared toon
 * material, so each kind costs one instanced draw (plus its ink outline).
 * Origins sit at the base centre on the ground; sizes are metres. Shapes are
 * seeded, so every load builds identical geometry.
 */
export class VegetationModels {
  private static materialValue: THREE.Material | null = null

  /** One toon material for every plant: white × vertex colour × instance tint. */
  static get material(): THREE.Material {
    return (this.materialValue ??= ToonMaterials.create({ color: '#ffffff', vertexColors: true }))
  }

  /** Grass tuft, ~0.7 m: a fan of blades leaning outwards. Neutral greys; the instance tint gives the hue. */
  static grass(): THREE.Group {
    const rnd = mulberry32(11)
    const b = new PlantBuilder()
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd() * 0.5
      const lean = 0.25 + rnd() * 0.45
      const h = 0.4 + rnd() * 0.45
      b.add(blade(h, 0.05), pose(Math.cos(a) * 0.1, -0.03, Math.sin(a) * 0.1, 0, -a, -lean), '#6c6c6c', '#ffffff')
    }
    return b.build('veg_grass', this.material)
  }

  /** Susuki (Japanese pampas) clump, ~2 m: long arching blades and cream plumes. */
  static pampas(): THREE.Group {
    const rnd = mulberry32(12)
    const b = new PlantBuilder()
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + rnd() * 0.4
      b.add(blade(1.1 + rnd() * 0.6, 0.06), pose(Math.cos(a) * 0.15, -0.05, Math.sin(a) * 0.15, 0, -a, -(0.2 + rnd() * 0.35)), palette.grassRust, palette.grassGold)
    }
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2
      const lean = 0.08 + rnd() * 0.25
      const h = 1.5 + rnd() * 0.5
      const stalk = new THREE.CylinderGeometry(0.015, 0.025, h, 3).translate(0, h / 2, 0)
      // the plume droops from the stalk top: an elongated cone, point down
      const plume = new THREE.ConeGeometry(0.09, 0.55, 4).rotateX(Math.PI).translate(0, h + 0.15, 0)
      const m = pose(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, 0, -a, -lean)
      b.add(stalk, m, palette.grassGold)
      b.add(plume, m, '#d9c39a', palette.pampasPlume)
    }
    return b.build('veg_pampas', this.material)
  }

  /** Fern, ~0.9 m: a rosette of flat lance-shaped fronds arching out. */
  static fern(): THREE.Group {
    const rnd = mulberry32(13)
    const b = new PlantBuilder()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rnd() * 0.3
      const len = 0.75 + rnd() * 0.35
      // flattened octahedron = a lance-shaped frond along +Y before it is laid outwards
      const frond = new THREE.OctahedronGeometry(0.5).scale(0.28, len, 0.06).translate(0, len * 0.5, 0)
      b.add(frond, pose(0, -0.03, 0, 0, -a, -(0.75 + rnd() * 0.35)), '#2f4a32', palette.fern)
    }
    return b.build('veg_fern', this.material)
  }

  /** Red spider lilies (higanbana, the autumn roadside flower): stems with red bursts over a few blades. */
  static flowers(): THREE.Group {
    const rnd = mulberry32(14)
    const b = new PlantBuilder()
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2
      const r = 0.1 + rnd() * 0.25
      const h = 0.4 + rnd() * 0.2
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      b.add(new THREE.CylinderGeometry(0.012, 0.02, h, 3).translate(0, h / 2, 0), pose(x, 0, z), '#4c6a36', '#6f8a40')
      b.add(new THREE.IcosahedronGeometry(0.1, 0).scale(1, 0.75, 1), pose(x, h + 0.04, z, 0, rnd() * 3), '#a8201e', palette.spiderLily)
    }
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2
      b.add(blade(0.25 + rnd() * 0.15, 0.04), pose(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08, 0, -a, -0.6), '#3f5a30', '#6f8a40')
    }
    return b.build('veg_flowers', this.material)
  }

  /** Round shrub, ~1.4 m: a few lumpy icosahedra. Light greys; the instance tint gives the autumn hue. */
  static bush(): THREE.Group {
    const rnd = mulberry32(15)
    const b = new PlantBuilder()
    const lobes: [number, number, number, number][] = [
      [0, 0.55, 0, 0.75],
      [0.5, 0.42, 0.2, 0.55],
      [-0.45, 0.4, 0.25, 0.55],
      [0.1, 0.45, -0.5, 0.55],
      [0.05, 0.95, 0.05, 0.45],
    ]
    for (const [x, y, z, r] of lobes) {
      const s = r * (0.9 + rnd() * 0.2)
      b.add(new THREE.IcosahedronGeometry(1, 0), pose(x, y, z, rnd(), rnd(), 0, s, s * 0.85, s), '#5a5a5a', '#ffffff')
    }
    return b.build('veg_bush', this.material)
  }

  /** Bamboo clump, ~8 m: tall thin culms with leaf tufts near the top. */
  static bamboo(): THREE.Group {
    const rnd = mulberry32(16)
    const b = new PlantBuilder()
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2
      const r = rnd() * 0.9
      const h = 6 + rnd() * 3
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const lean = (rnd() - 0.5) * 0.12
      const m = pose(x, -0.1, z, lean, 0, (rnd() - 0.5) * 0.12)
      b.add(new THREE.CylinderGeometry(0.06, 0.09, h, 5).translate(0, h / 2, 0), m, '#6f8a46', palette.bamboo)
      for (let k = 0; k < 3; k++) {
        const y = h * (0.62 + k * 0.14)
        const s = 0.9 - k * 0.15
        const leaf = new THREE.IcosahedronGeometry(1, 0).scale(s * 1.3, s * 0.35, s * 1.3).translate((rnd() - 0.5) * 0.6, y, (rnd() - 0.5) * 0.6)
        b.add(leaf, m, '#3e6236', palette.bambooLeaf)
      }
    }
    return b.build('veg_bamboo', this.material)
  }

  /** Jizo statue, ~0.9 m: a stone figure with a red bib on a stone plinth (faces +Z). */
  static jizo(): THREE.Group {
    const b = new PlantBuilder()
    b.add(new THREE.BoxGeometry(0.6, 0.2, 0.55).translate(0, 0.1, 0), pose(0, 0, 0), '#6e6478', palette.stone)
    b.add(new THREE.CylinderGeometry(0.15, 0.22, 0.5, 6).translate(0, 0.45, 0), pose(0, 0, 0), '#7a7084', palette.stone)
    b.add(new THREE.IcosahedronGeometry(0.15, 1).translate(0, 0.83, 0), pose(0, 0, 0), palette.stone, '#b8b0c0')
    // the bib: a flattened cone hanging over the chest, towards +Z
    b.add(new THREE.ConeGeometry(0.21, 0.24, 6).rotateX(Math.PI).scale(1, 1, 0.55).translate(0, 0.6, 0.06), pose(0, 0, 0), '#9a2418', palette.torii)
    return b.build('veg_jizo', this.material)
  }
}
