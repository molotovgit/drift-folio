import * as THREE from 'three/webgpu'
import type { Vec3 } from '../core/math'

/**
 * Stylised tyre smoke (spec §5): white swirling wisps, not grey puffs.
 * Instanced camera-facing quads with a procedural swirl texture.
 */
export function smokeGate(drifting: boolean, slide: number): number {
  if (!drifting && slide < 0.6) return 0
  return Math.min(1, slide)
}

function swirlTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.translate(64, 64)
  for (let i = 0; i < 3; i++) {
    g.rotate((Math.PI * 2) / 3)
    g.beginPath()
    for (let t = 0; t < 1; t += 0.02) {
      const r = 10 + t * 48
      const a = t * 5.2
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      if (t === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.strokeStyle = 'rgba(255,255,255,0.95)'
    g.lineWidth = 9
    g.lineCap = 'round'
    g.stroke()
  }
  const rad = g.createRadialGradient(0, 0, 0, 0, 0, 60)
  rad.addColorStop(0, 'rgba(255,255,255,0.85)')
  rad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = rad
  g.globalCompositeOperation = 'destination-in'
  g.fillRect(-64, -64, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

interface Puff {
  alive: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  age: number
  life: number
  size: number
  spin: number
  rot: number
}

export function createSmoke(scene: THREE.Scene, max = 260) {
  const mat = new THREE.SpriteNodeMaterial({ map: swirlTexture(), transparent: true, depthWrite: false, color: '#f6eefc' })
  const puffs: Puff[] = []
  const sprites: THREE.Sprite[] = []
  for (let i = 0; i < max; i++) {
    const s = new THREE.Sprite(mat.clone())
    s.visible = false
    scene.add(s)
    sprites.push(s)
    puffs.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: 1, size: 1, spin: 0, rot: 0 })
  }
  let cursor = 0
  let budget = 0

  return {
    /** emission rate scales with intensity (0..1); call per frame */
    emit(at: Vec3, intensity: number, carVel: Vec3, dt: number) {
      if (intensity <= 0) return
      budget += intensity * 38 * dt
      while (budget >= 1) {
        budget -= 1
        const p = puffs[cursor]
        cursor = (cursor + 1) % max
        p.alive = true
        p.age = 0
        p.life = 1.2 + Math.random() * 0.9
        p.size = 0.45 + Math.random() * 0.35
        p.spin = (Math.random() - 0.5) * 3
        p.rot = Math.random() * Math.PI * 2
        p.pos.set(at.x + (Math.random() - 0.5) * 0.4, at.y + 0.25, at.z + (Math.random() - 0.5) * 0.4)
        p.vel.set(carVel.x * 0.35 + (Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 0.7, carVel.z * 0.35 + (Math.random() - 0.5) * 1.6)
      }
    },
    update(dt: number) {
      for (let i = 0; i < max; i++) {
        const p = puffs[i]
        const s = sprites[i]
        if (!p.alive) {
          s.visible = false
          continue
        }
        p.age += dt
        if (p.age >= p.life) {
          p.alive = false
          s.visible = false
          continue
        }
        const k = p.age / p.life
        p.vel.multiplyScalar(1 - 1.4 * dt)
        p.pos.addScaledVector(p.vel, dt)
        p.rot += p.spin * dt
        s.visible = true
        s.position.copy(p.pos)
        const size = p.size * (1 + k * 2.4)
        s.scale.set(size, size, 1)
        const m = s.material as THREE.SpriteNodeMaterial
        m.rotation = p.rot
        m.opacity = (1 - k) * (k < 0.1 ? k / 0.1 : 1) * 0.55
      }
    },
  }
}
