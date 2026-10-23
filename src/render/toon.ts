import * as THREE from 'three/webgpu'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { palette } from './palette'

export interface ToonOptions {
  color: string
  bands?: 2 | 3
  emissive?: string
  emissiveIntensity?: number
  map?: THREE.Texture | null
  transparent?: boolean
  opacity?: number
  side?: THREE.Side
  vertexColors?: boolean
  /** faceted look (default) — shading uses face normals while the outline hull uses smooth ones */
  flatShading?: boolean
}

/** Material-name overrides so asset colours follow the live palette (names come from tools/blender/lib.py). */
const NAME_OVERRIDES: Record<string, Partial<ToonOptions>> = {
  paint: { color: palette.carTeal },
  paint_shadow: { color: palette.carShadow },
  headlight: { color: palette.headlight, emissive: palette.headlight, emissiveIntensity: 3 },
  taillight: { color: '#ff3050', emissive: '#ff3050', emissiveIntensity: 2.2 },
  lamp_glow: { color: palette.lampGlow, emissive: palette.lampGlow, emissiveIntensity: 4 },
  screen: { color: '#9fe8ff', emissive: '#9fe8ff', emissiveIntensity: 1.6 },
  paper_lantern: { color: '#ffcf7a', emissive: '#ffb35a', emissiveIntensity: 2.4 },
  glass: { color: '#2a2440', bands: 2 },
  // the car body is a smooth loft; faceting it would look wrong
}
const SMOOTH_SHADED = new Set(['paint', 'paint_shadow', 'glass'])

/**
 * Cel-shading for the whole game (spec §5: 2–3 hard light bands). Builds toon
 * materials and converts loaded glTF scenes to them, sharing one material per
 * (name, map, side, transparency).
 */
export class ToonMaterials {
  private static readonly gradients = new Map<number, THREE.DataTexture>()
  private static readonly cache = new Map<string, THREE.MeshToonNodeMaterial>()
  private static readonly welded = new WeakSet<THREE.BufferGeometry>()

  /** Hard light-band ramp sampled by the toon material. */
  static gradient(bands: 2 | 3 = 3): THREE.DataTexture {
    const hit = this.gradients.get(bands)
    if (hit) return hit
    const steps = bands === 2 ? [90, 255] : [70, 170, 255]
    const data = new Uint8Array(steps.length * 4)
    steps.forEach((v, i) => data.set([v, v, v, 255], i * 4))
    const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat)
    tex.minFilter = tex.magFilter = THREE.NearestFilter
    tex.generateMipmaps = false
    tex.needsUpdate = true
    this.gradients.set(bands, tex)
    return tex
  }

  static create(o: ToonOptions): THREE.MeshToonNodeMaterial {
    const m = new THREE.MeshToonNodeMaterial({
      color: o.color,
      gradientMap: this.gradient(o.bands ?? 3),
      map: o.map ?? null,
      transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1,
      side: o.side ?? THREE.FrontSide,
      vertexColors: o.vertexColors ?? false,
    })
    // node materials honour flatShading (normals from screen-space derivatives)
    ;(m as THREE.MeshToonNodeMaterial & { flatShading: boolean }).flatShading = o.flatShading ?? true
    if (o.emissive) {
      m.emissive = new THREE.Color(o.emissive)
      m.emissiveIntensity = o.emissiveIntensity ?? 1
    }
    return m
  }

  /** Convert every material in a loaded glTF to toon; casts/receives shadows. */
  static toonify(root: THREE.Object3D, opts: { shadows?: boolean } = {}): THREE.Object3D {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      this.weldForOutline(mesh)
      mesh.castShadow = opts.shadows ?? true
      mesh.receiveShadow = opts.shadows ?? true
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => this.convert(m)) : this.convert(mesh.material)
    })
    return root
  }

  /**
   * The outline pass pushes vertices out along their normals; split (flat) normals
   * would crack the hull at hard edges. Weld vertices and use smooth normals —
   * `flatShading` keeps the shading itself faceted.
   */
  private static weldForOutline(mesh: THREE.Mesh): void {
    if (this.welded.has(mesh.geometry)) return
    const g = mesh.geometry.clone()
    g.deleteAttribute('normal')
    const welded = mergeVertices(g, 1e-4)
    welded.computeVertexNormals()
    this.welded.add(welded)
    mesh.geometry = welded
  }

  private static convert(src: THREE.Material): THREE.Material {
    const s = src as THREE.MeshStandardMaterial
    const key = [s.name || `#${s.color?.getHexString?.() ?? 'fff'}`, s.map?.uuid ?? '', s.side, s.transparent, s.vertexColors].join('|')
    const hit = this.cache.get(key)
    if (hit) return hit
    const emissiveOn = !!s.emissive && s.emissive.getHex() !== 0 && s.emissiveIntensity > 0
    const m = this.create({
      color: `#${s.color?.getHexString() ?? 'ffffff'}`,
      map: s.map,
      emissive: emissiveOn ? `#${s.emissive.getHexString()}` : undefined,
      emissiveIntensity: emissiveOn ? Math.min(s.emissiveIntensity, 4) : undefined,
      side: s.side,
      transparent: s.transparent,
      opacity: s.opacity,
      vertexColors: s.vertexColors,
      flatShading: !SMOOTH_SHADED.has(s.name),
      ...NAME_OVERRIDES[s.name],
    })
    m.name = s.name
    this.cache.set(key, m)
    return m
  }
}
