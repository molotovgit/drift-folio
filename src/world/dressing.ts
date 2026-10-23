import * as THREE from 'three/webgpu'
import { loadModel } from '../render/loadModel'

export interface Placement {
  model: string
  x: number
  z: number
  y?: number
  yaw?: number
  scale?: number
}

/** Seeded PRNG so dressing is identical every load (and in screenshot tests). */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Place glTF props. Repeated models share geometry via instancing-by-clone
 * (three shares BufferGeometry between clones, so memory stays flat).
 */
export async function placeModels(scene: THREE.Scene, items: Placement[]): Promise<THREE.Group> {
  const group = new THREE.Group()
  const names = [...new Set(items.map((i) => i.model))]
  const templates = new Map<string, THREE.Group>()
  await Promise.all(
    names.map(async (n) => {
      try {
        templates.set(n, await loadModel(n))
      } catch (err) {
        console.warn(`model ${n} failed to load`, err)
      }
    }),
  )
  for (const it of items) {
    const t = templates.get(it.model)
    if (!t) continue
    const o = t.clone(true)
    o.position.set(it.x, it.y ?? 0, it.z)
    o.rotation.y = it.yaw ?? 0
    o.scale.setScalar(it.scale ?? 1)
    group.add(o)
  }
  scene.add(group)
  return group
}

/** M2 style-check dressing for the grey-box pad. */
export function greyboxDressing(): Placement[] {
  const rnd = mulberry32(42)
  const items: Placement[] = [{ model: 'torii', x: 0, z: 14, yaw: 0 }]
  for (let i = 0; i < 6; i++) items.push({ model: 'lamp', x: i % 2 ? 9 : -9, z: 30 + i * 28, yaw: i % 2 ? 0 : Math.PI })
  for (let i = 0; i < 70; i++) {
    const side = i % 2 ? 1 : -1
    const x = side * (16 + rnd() * 40)
    const z = -30 + rnd() * 260
    const r = rnd()
    const model = r < 0.55 ? `tree_maple_${Math.floor(rnd() * 4)}` : `tree_pine_${Math.floor(rnd() * 3)}`
    items.push({ model, x, z, yaw: rnd() * Math.PI * 2, scale: 0.85 + rnd() * 0.4 })
  }
  items.push({ model: 'vending_machine_red', x: -12, z: 4, yaw: Math.PI / 2 })
  items.push({ model: 'vending_machine_blue', x: -12, z: 5.2, yaw: Math.PI / 2 })
  items.push({ model: 'shrine', x: 14, z: 2, yaw: -Math.PI / 2 })
  items.push({ model: 'paper_lantern', x: 6, z: 14, y: 4.4 }, { model: 'paper_lantern', x: -6, z: 14, y: 4.4 })
  return items
}
