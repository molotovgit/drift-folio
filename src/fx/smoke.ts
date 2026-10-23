import * as THREE from 'three/webgpu'
import { attribute, texture, uv } from 'three/tsl'
import type { Vec3 } from '../core/math'

/** Emission rate per wheel at full intensity, puffs/s. */
export const SMOKE_RATE = 34
export const SMOKE_MAX_LIFE = 2.0

/** Smoke intensity (0..1) for a wheel: only while drifting or sliding hard. */
export function smokeGate(drifting: boolean, slide: number): number {
  if (!drifting && slide < 0.6) return 0
  return Math.min(1, slide)
}

/** Pool size that never recycles a live puff with `wheels` emitting at full rate. */
export function smokePoolSize(wheels: number): number {
  return Math.ceil(SMOKE_RATE * wheels * SMOKE_MAX_LIFE * 1.1)
}

/** One trailing white curl per puff (reads like the reference's swirl, not a stamp). */
function swirlTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.translate(64, 64)
  g.beginPath()
  for (let t = 0; t <= 1; t += 0.02) {
    const r = 8 + t * 50
    const a = t * 4.2
    if (t === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  g.strokeStyle = 'rgba(255,255,255,1)'
  g.lineWidth = 14
  g.lineCap = 'round'
  g.stroke()
  const soft = g.createRadialGradient(0, 0, 0, 0, 0, 62)
  soft.addColorStop(0, 'rgba(255,255,255,0.55)')
  soft.addColorStop(0.7, 'rgba(255,255,255,0.18)')
  soft.addColorStop(1, 'rgba(255,255,255,0)')
  g.globalCompositeOperation = 'destination-over'
  g.fillStyle = soft
  g.fillRect(-64, -64, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * Stylised tyre smoke (spec §5). One InstancedMesh (single draw call); each
 * puff is a camera-facing quad with its own rotation, size and alpha.
 */
export class SmokeSystem {
  readonly mesh: THREE.InstancedMesh
  private readonly texture = swirlTexture()
  private readonly alpha: THREE.InstancedBufferAttribute
  private readonly pos: Float32Array
  private readonly vel: Float32Array
  private readonly age: Float32Array
  private readonly life: Float32Array
  private readonly size: Float32Array
  private readonly rot: Float32Array
  private readonly spin: Float32Array
  private cursor = 0
  private budget = 0
  private liveCount = 0
  // scratch objects reused every frame (no per-frame allocation)
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly qr = new THREE.Quaternion()
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()
  private static readonly VIEW_AXIS = new THREE.Vector3(0, 0, 1)

  constructor(
    private readonly scene: THREE.Scene,
    private readonly max = smokePoolSize(2),
  ) {
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage)
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.setAttribute('puffAlpha', this.alpha)
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })
    const sample = texture(this.texture, uv())
    mat.colorNode = sample.rgb.mul(0.97)
    mat.opacityNode = sample.a.mul(attribute('puffAlpha', 'float'))
    this.mesh = new THREE.InstancedMesh(geo, mat, max)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
    scene.add(this.mesh)
    this.pos = new Float32Array(max * 3)
    this.vel = new Float32Array(max * 3)
    this.age = new Float32Array(max).fill(Infinity)
    this.life = new Float32Array(max).fill(1)
    this.size = new Float32Array(max)
    this.rot = new Float32Array(max)
    this.spin = new Float32Array(max)
  }

  /** Puffs alive after the last update. */
  get live(): number {
    return this.liveCount
  }

  /** Emission rate scales with intensity (0..1); call once per frame per wheel. */
  emit(at: Vec3, intensity: number, carVel: Vec3, dt: number): void {
    if (intensity <= 0 || dt <= 0) return
    this.budget += intensity * SMOKE_RATE * dt
    while (this.budget >= 1) {
      this.budget -= 1
      this.spawn(this.cursor, at, carVel)
      this.cursor = (this.cursor + 1) % this.max
    }
  }

  /** Age, move and billboard every puff toward the camera. */
  update(dt: number, camera: THREE.Camera): void {
    this.liveCount = 0
    const drag = 1 - 1.4 * dt
    const alpha = this.alpha.array as Float32Array
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) {
        alpha[i] = 0
        this.m.makeScale(0, 0, 0)
        this.mesh.setMatrixAt(i, this.m)
        continue
      }
      this.age[i] += dt
      const k = Math.min(1, this.age[i] / this.life[i])
      for (let a = 0; a < 3; a++) {
        this.vel[i * 3 + a] *= drag
        this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt
      }
      this.rot[i] += this.spin[i] * dt
      const sz = this.size[i] * (1 + k * 2.4)
      this.qr.setFromAxisAngle(SmokeSystem.VIEW_AXIS, this.rot[i])
      this.q.copy(camera.quaternion).multiply(this.qr)
      this.p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2])
      this.s.set(sz, sz, sz)
      this.m.compose(this.p, this.q, this.s)
      this.mesh.setMatrixAt(i, this.m)
      // quick fade-in, linear fade-out
      alpha[i] = (1 - k) * (k < 0.1 ? k / 0.1 : 1) * 0.6
      this.liveCount++
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.alpha.needsUpdate = true
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.texture.dispose()
  }

  private spawn(i: number, at: Vec3, carVel: Vec3): void {
    this.age[i] = 0
    this.life[i] = 1.2 + Math.random() * (SMOKE_MAX_LIFE - 1.2)
    this.size[i] = 0.5 + Math.random() * 0.35
    this.rot[i] = Math.random() * Math.PI * 2
    this.spin[i] = (Math.random() - 0.5) * 3
    this.pos[i * 3] = at.x + (Math.random() - 0.5) * 0.4
    this.pos[i * 3 + 1] = at.y + 0.25
    this.pos[i * 3 + 2] = at.z + (Math.random() - 0.5) * 0.4
    // puffs inherit some of the car's velocity so the trail streams behind it
    this.vel[i * 3] = carVel.x * 0.35 + (Math.random() - 0.5) * 1.6
    this.vel[i * 3 + 1] = 0.6 + Math.random() * 0.7
    this.vel[i * 3 + 2] = carVel.z * 0.35 + (Math.random() - 0.5) * 1.6
  }
}
