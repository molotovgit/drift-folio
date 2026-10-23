import * as THREE from 'three/webgpu'
import { palette } from './palette'

let gradient2: THREE.DataTexture | null = null
let gradient3: THREE.DataTexture | null = null

/** Hard light bands for cel shading (spec §5: 2-3 bands). */
export function toonGradient(bands: 2 | 3 = 3): THREE.DataTexture {
  const cached = bands === 2 ? gradient2 : gradient3
  if (cached) return cached
  const steps = bands === 2 ? [90, 255] : [70, 170, 255]
  const data = new Uint8Array(steps.length * 4)
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4))
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat)
  tex.minFilter = tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  if (bands === 2) gradient2 = tex
  else gradient3 = tex
  return tex
}

export interface ToonOptions {
  color: string
  bands?: 2 | 3
  emissive?: string
  emissiveIntensity?: number
  map?: THREE.Texture | null
  transparent?: boolean
  opacity?: number
  side?: THREE.Side
}

export function toonMaterial(o: ToonOptions): THREE.MeshToonNodeMaterial {
  const m = new THREE.MeshToonNodeMaterial({
    color: o.color,
    gradientMap: toonGradient(o.bands ?? 3),
    map: o.map ?? null,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
  })
  if (o.emissive) {
    m.emissive = new THREE.Color(o.emissive)
    m.emissiveIntensity = o.emissiveIntensity ?? 1
  }
  return m
}

/** Material-name overrides so asset colours follow the live palette. */
const nameOverrides: Record<string, Partial<ToonOptions>> = {
  paint: { color: palette.carTeal },
  paint_shadow: { color: palette.carShadow },
  headlight: { color: palette.headlight, emissive: palette.headlight, emissiveIntensity: 3 },
  taillight: { color: '#ff3050', emissive: '#ff3050', emissiveIntensity: 2.2 },
  lamp_glow: { color: palette.lampGlow, emissive: palette.lampGlow, emissiveIntensity: 4 },
  screen: { color: '#9fe8ff', emissive: '#9fe8ff', emissiveIntensity: 1.6 },
  paper_lantern: { color: '#ffcf7a', emissive: '#ffb35a', emissiveIntensity: 2.4 },
  glass: { color: '#2a2440', bands: 2 },
}

const cache = new Map<string, THREE.MeshToonNodeMaterial>()

/**
 * Replace every material in a loaded glTF with a toon material of the same
 * colour, reusing one material per name. Casts/receives shadows.
 */
export function toonify(root: THREE.Object3D, opts: { shadows?: boolean } = {}): THREE.Object3D {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = opts.shadows ?? true
    mesh.receiveShadow = opts.shadows ?? true
    const convert = (src: THREE.Material): THREE.Material => {
      const s = src as THREE.MeshStandardMaterial
      const key = s.name || `#${s.color?.getHexString?.() ?? 'fff'}`
      const hit = cache.get(key)
      if (hit) return hit
      const emissiveOn = s.emissive && s.emissive.getHex() !== 0 && s.emissiveIntensity > 0
      const base: ToonOptions = {
        color: `#${s.color?.getHexString() ?? 'ffffff'}`,
        map: s.map,
        emissive: emissiveOn ? `#${s.emissive.getHexString()}` : undefined,
        emissiveIntensity: emissiveOn ? Math.min(s.emissiveIntensity, 4) : undefined,
      }
      const m = toonMaterial({ ...base, ...nameOverrides[s.name] })
      m.name = s.name
      cache.set(key, m)
      return m
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material)
  })
  return root
}
