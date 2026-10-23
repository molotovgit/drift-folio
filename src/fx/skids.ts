import * as THREE from 'three/webgpu'
import { attribute } from 'three/tsl'
import type { Vec3 } from '../core/math'

export const SKID_CAPACITY = 4000
/** Below this tyre slide amount no mark is laid. */
const SKID_MIN_SLIDE = 0.45
/** Minimum stroke length before a new quad is written, metres. */
const SKID_MIN_STEP = 0.25
const SKID_HALF_WIDTH = 0.11
/** Lift above the contact point to avoid z-fighting with the road. */
const SKID_LIFT = 0.03

/**
 * Ring buffer of skid-mark quads (4 vertices each). The oldest quads are
 * overwritten once the buffer is full. Pure data: unit-testable without a GPU.
 */
export class SkidBuffer {
  readonly positions: Float32Array
  readonly alphas: Float32Array
  private next = 0
  private filled = 0

  constructor(readonly capacity = SKID_CAPACITY) {
    this.positions = new Float32Array(capacity * 4 * 3)
    this.alphas = new Float32Array(capacity * 4)
  }

  get count(): number {
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
    const y = SKID_LIFT
    this.positions.set(
      [a.x + nx, a.y + y, a.z + nz, a.x - nx, a.y + y, a.z - nz, b.x - nx, b.y + y, b.z - nz, b.x + nx, b.y + y, b.z + nz],
      slot * 12,
    )
    this.alphas.fill(alpha, slot * 4, slot * 4 + 4)
    this.next = (this.next + 1) % this.capacity
    this.filled = Math.min(this.filled + 1, this.capacity)
    return slot
  }
}

/**
 * Skid marks: one dynamic mesh fed by a SkidBuffer. Each wheel draws a
 * continuous strip while it slides; only freshly written slots are uploaded.
 */
export class SkidMarks {
  readonly buffer: SkidBuffer
  private readonly geometry = new THREE.BufferGeometry()
  private readonly positionAttr: THREE.BufferAttribute
  private readonly alphaAttr: THREE.BufferAttribute
  private readonly lastPoint: (Vec3 | null)[] = [null, null, null, null]
  private dirty = false
  private dirtyLo = Infinity
  private dirtyHi = -1

  constructor(scene: THREE.Scene, capacity = SKID_CAPACITY) {
    this.buffer = new SkidBuffer(capacity)
    this.positionAttr = new THREE.BufferAttribute(this.buffer.positions, 3).setUsage(THREE.DynamicDrawUsage)
    this.alphaAttr = new THREE.BufferAttribute(this.buffer.alphas, 1).setUsage(THREE.DynamicDrawUsage)
    this.geometry.setAttribute('position', this.positionAttr)
    this.geometry.setAttribute('skidAlpha', this.alphaAttr)
    const index = new Uint32Array(capacity * 6)
    for (let i = 0; i < capacity; i++) index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6)
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1))
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    this.geometry.setDrawRange(0, 0)

    const material = new THREE.MeshBasicNodeMaterial({ color: '#07030a', transparent: true, depthWrite: false })
    material.opacityNode = attribute('skidAlpha', 'float')
    material.polygonOffset = true
    material.polygonOffsetFactor = -2
    const mesh = new THREE.Mesh(this.geometry, material)
    mesh.frustumCulled = false
    mesh.renderOrder = 1
    scene.add(mesh)
  }

  /** Call once per physics tick with each wheel's contact point and slide amount. */
  step(wheel: number, contact: Vec3 | null, slide: number): void {
    if (!contact || slide < SKID_MIN_SLIDE) {
      this.lastPoint[wheel] = null
      return
    }
    const prev = this.lastPoint[wheel]
    if (!prev) {
      this.lastPoint[wheel] = { ...contact }
      return
    }
    if (Math.hypot(contact.x - prev.x, contact.z - prev.z) <= SKID_MIN_STEP) return
    const slot = this.buffer.add(prev, contact, SKID_HALF_WIDTH, Math.min(0.85, 0.35 + slide * 0.55))
    this.dirtyLo = Math.min(this.dirtyLo, slot)
    this.dirtyHi = Math.max(this.dirtyHi, slot)
    this.lastPoint[wheel] = { ...contact }
    this.dirty = true
  }

  /** Upload what changed (once per rendered frame); a ring wrap uploads the whole span. */
  flush(): void {
    if (!this.dirty) return
    const count = this.dirtyHi - this.dirtyLo + 1
    this.positionAttr.clearUpdateRanges()
    this.alphaAttr.clearUpdateRanges()
    this.positionAttr.addUpdateRange(this.dirtyLo * 12, count * 12)
    this.alphaAttr.addUpdateRange(this.dirtyLo * 4, count * 4)
    this.positionAttr.needsUpdate = true
    this.alphaAttr.needsUpdate = true
    this.geometry.setDrawRange(0, this.buffer.count * 6)
    this.dirty = false
    this.dirtyLo = Infinity
    this.dirtyHi = -1
  }
}
