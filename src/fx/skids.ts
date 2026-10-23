import * as THREE from 'three/webgpu'
import { attribute } from 'three/tsl'
import type { Vec3 } from '../core/math'

export const SKID_CAPACITY = 4000

/**
 * Ring buffer of skid-mark quads. Each wheel draws a continuous strip while it
 * slides; the oldest quads are overwritten once the buffer is full.
 */
export class SkidBuffer {
  readonly capacity: number
  private next = 0
  private filled = 0
  readonly positions: Float32Array
  readonly alphas: Float32Array

  constructor(capacity = SKID_CAPACITY) {
    this.capacity = capacity
    this.positions = new Float32Array(capacity * 4 * 3)
    this.alphas = new Float32Array(capacity * 4)
  }

  get count() {
    return this.filled
  }

  /** Write one quad from a→b with half-width w. Returns the slot used. */
  add(a: Vec3, b: Vec3, w: number, alpha: number): number {
    const dx = b.x - a.x
    const dz = b.z - a.z
    const l = Math.hypot(dx, dz) || 1
    const nx = (-dz / l) * w
    const nz = (dx / l) * w
    const slot = this.next
    const p = this.positions
    const o = slot * 12
    const y = 0.03
    p.set([a.x + nx, a.y + y, a.z + nz, a.x - nx, a.y + y, a.z - nz, b.x - nx, b.y + y, b.z - nz, b.x + nx, b.y + y, b.z + nz], o)
    this.alphas.fill(alpha, slot * 4, slot * 4 + 4)
    this.next = (this.next + 1) % this.capacity
    this.filled = Math.min(this.filled + 1, this.capacity)
    return slot
  }
}

export function createSkids(scene: THREE.Scene, capacity = SKID_CAPACITY) {
  const buf = new SkidBuffer(capacity)
  const geo = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(buf.positions, 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  const alphaAttr = new THREE.BufferAttribute(buf.alphas, 1)
  alphaAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('skidAlpha', alphaAttr)
  const idx = new Uint32Array(capacity * 6)
  for (let i = 0; i < capacity; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6)
  geo.setIndex(new THREE.BufferAttribute(idx, 1))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

  const mat = new THREE.MeshBasicNodeMaterial({ color: '#150d1c', transparent: true, depthWrite: false })
  mat.opacityNode = attribute('skidAlpha', 'float')
  mat.polygonOffset = true
  mat.polygonOffsetFactor = -2
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  scene.add(mesh)

  const last: (Vec3 | null)[] = [null, null, null, null]
  let dirty = false

  return {
    buffer: buf,
    /** call once per physics step with each wheel's contact and slide amount */
    step(wheel: number, contact: Vec3 | null, slide: number) {
      if (!contact || slide < 0.45) {
        last[wheel] = null
        return
      }
      const prev = last[wheel]
      if (prev && Math.hypot(contact.x - prev.x, contact.z - prev.z) > 0.25) {
        buf.add(prev, contact, 0.11, Math.min(0.75, 0.25 + slide * 0.55))
        last[wheel] = { ...contact }
        dirty = true
      } else if (!prev) last[wheel] = { ...contact }
    },
    flush() {
      if (!dirty) return
      posAttr.needsUpdate = true
      alphaAttr.needsUpdate = true
      dirty = false
    },
  }
}
