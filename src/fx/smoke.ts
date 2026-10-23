import * as THREE from 'three/webgpu'
import { attribute, texture, uv } from 'three/tsl'
import type { Vec3 } from '../core/math'

/**
 * Stylised tyre smoke (spec §5): white swirling wisps, not grey puffs.
 * One InstancedMesh (single draw call); each puff is a camera-facing quad with
 * its own rotation, size and alpha.
 */
export function smokeGate(drifting: boolean, slide: number): number {
  if (!drifting && slide < 0.6) return 0
  return Math.min(1, slide)
}

/** Emission rate per wheel at full intensity, puffs/s. */
export const SMOKE_RATE = 34
export const SMOKE_MAX_LIFE = 2.0

/** Pool size that never recycles a live puff with `wheels` emitting at full rate. */
export function smokePoolSize(wheels: number): number {
  return Math.ceil(SMOKE_RATE * wheels * SMOKE_MAX_LIFE * 1.1)
}

function swirlTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.translate(64, 64)
  // one trailing arc per puff (reads like the reference's white curl, not a stamp)
  g.beginPath()
  for (let t = 0; t <= 1; t += 0.02) {
    const r = 8 + t * 50
    const a = t * 4.2
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (t === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
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

export function createSmoke(scene: THREE.Scene, max = smokePoolSize(2)) {
  const tex = swirlTexture()
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1)
  alpha.setUsage(THREE.DynamicDrawUsage)
  const geo = new THREE.PlaneGeometry(1, 1)
  geo.setAttribute('puffAlpha', alpha)
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })
  const sample = texture(tex, uv())
  mat.colorNode = sample.rgb.mul(0.97)
  mat.opacityNode = sample.a.mul(attribute('puffAlpha', 'float'))
  const mesh = new THREE.InstancedMesh(geo, mat, max)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  scene.add(mesh)

  const pos = new Float32Array(max * 3)
  const vel = new Float32Array(max * 3)
  const age = new Float32Array(max).fill(Infinity)
  const life = new Float32Array(max).fill(1)
  const size = new Float32Array(max)
  const rot = new Float32Array(max)
  const spin = new Float32Array(max)
  let cursor = 0
  let budget = 0
  let live = 0

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const qr = new THREE.Quaternion()
  const p = new THREE.Vector3()
  const s = new THREE.Vector3()
  const Z = new THREE.Vector3(0, 0, 1)

  return {
    mesh,
    /** emission rate scales with intensity (0..1); call once per frame per wheel */
    emit(at: Vec3, intensity: number, carVel: Vec3, dt: number) {
      if (intensity <= 0 || dt <= 0) return
      budget += intensity * SMOKE_RATE * dt
      while (budget >= 1) {
        budget -= 1
        const i = cursor
        cursor = (cursor + 1) % max
        age[i] = 0
        life[i] = 1.2 + Math.random() * (SMOKE_MAX_LIFE - 1.2)
        size[i] = 0.5 + Math.random() * 0.35
        rot[i] = Math.random() * Math.PI * 2
        spin[i] = (Math.random() - 0.5) * 3
        pos[i * 3] = at.x + (Math.random() - 0.5) * 0.4
        pos[i * 3 + 1] = at.y + 0.25
        pos[i * 3 + 2] = at.z + (Math.random() - 0.5) * 0.4
        vel[i * 3] = carVel.x * 0.35 + (Math.random() - 0.5) * 1.6
        vel[i * 3 + 1] = 0.6 + Math.random() * 0.7
        vel[i * 3 + 2] = carVel.z * 0.35 + (Math.random() - 0.5) * 1.6
      }
    },
    update(dt: number, camera: THREE.Camera) {
      live = 0
      const drag = 1 - 1.4 * dt
      for (let i = 0; i < max; i++) {
        if (age[i] >= life[i]) {
          alpha.array[i] = 0
          m.makeScale(0, 0, 0)
          mesh.setMatrixAt(i, m)
          continue
        }
        age[i] += dt
        const k = Math.min(1, age[i] / life[i])
        vel[i * 3] *= drag
        vel[i * 3 + 1] *= drag
        vel[i * 3 + 2] *= drag
        pos[i * 3] += vel[i * 3] * dt
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt
        rot[i] += spin[i] * dt
        const sz = size[i] * (1 + k * 2.4)
        qr.setFromAxisAngle(Z, rot[i])
        q.copy(camera.quaternion).multiply(qr)
        p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
        s.set(sz, sz, sz)
        m.compose(p, q, s)
        mesh.setMatrixAt(i, m)
        alpha.array[i] = (1 - k) * (k < 0.1 ? k / 0.1 : 1) * 0.6
        live++
      }
      mesh.instanceMatrix.needsUpdate = true
      alpha.needsUpdate = true
    },
    get live() {
      return live
    },
    dispose() {
      scene.remove(mesh)
      geo.dispose()
      mat.dispose()
      tex.dispose()
    },
  }
}
