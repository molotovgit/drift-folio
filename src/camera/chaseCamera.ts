import type * as THREE from 'three/webgpu'
import { clamp, damp, fromGround, type Vec3 } from '../core/math'
import type { Telemetry } from '../vehicle/driftCar'

export type CameraMode = 'chase' | 'top'

export interface CameraTarget {
  pos: Vec3
  look: Vec3
  fov: number
}

const CHASE_BACK = 6
const CHASE_UP = 2.2
const TOP_HEIGHT = 18
const TOP_PITCH_DEG = 55
const FOV_MIN = 60
const FOV_MAX = 72
const FOV_SPEED = 40
/** how far the chase direction leans from heading toward velocity */
const VELOCITY_LEAN = 0.75

/** Horizontal unit direction the camera looks along: heading blended toward velocity. */
export function chaseDirection(t: Pick<Telemetry, 'heading' | 'vel' | 'speed'>): Vec3 {
  const h = fromGround(t.heading)
  const vl = Math.hypot(t.vel.x, t.vel.z)
  if (vl < 0.5) return h
  const vd = { x: t.vel.x / vl, y: 0, z: t.vel.z / vl }
  // moving backwards: keep looking along the nose
  if (h.x * vd.x + h.z * vd.z < -0.2) return h
  const w = VELOCITY_LEAN * clamp(t.speed / 10, 0, 1)
  const x = h.x + (vd.x - h.x) * w
  const z = h.z + (vd.z - h.z) * w
  const l = Math.hypot(x, z) || 1
  return { x: x / l, y: 0, z: z / l }
}

export function chaseTarget(t: Pick<Telemetry, 'pos' | 'heading' | 'vel' | 'speed'>, mode: CameraMode = 'chase'): CameraTarget {
  const d = chaseDirection(t)
  const fov = FOV_MIN + (FOV_MAX - FOV_MIN) * clamp(t.speed / FOV_SPEED, 0, 1)
  if (mode === 'top') {
    const back = TOP_HEIGHT / Math.tan((TOP_PITCH_DEG * Math.PI) / 180)
    return {
      pos: { x: t.pos.x - d.x * back, y: t.pos.y + TOP_HEIGHT, z: t.pos.z - d.z * back },
      look: { ...t.pos },
      fov: FOV_MIN,
    }
  }
  return {
    pos: { x: t.pos.x - d.x * CHASE_BACK, y: t.pos.y + CHASE_UP, z: t.pos.z - d.z * CHASE_BACK },
    look: { x: t.pos.x + d.x * 4, y: t.pos.y + 0.8, z: t.pos.z + d.z * 4 },
    fov,
  }
}

export function createChaseCamera(cam: THREE.PerspectiveCamera, groundHeightAt?: (x: number, z: number) => number) {
  let mode: CameraMode = 'chase'
  let cur: CameraTarget | null = null
  return {
    get mode() {
      return mode
    },
    toggleMode() {
      mode = mode === 'chase' ? 'top' : 'chase'
    },
    snap() {
      cur = null
    },
    update(t: Telemetry, dt: number) {
      const tgt = chaseTarget(t, mode)
      if (groundHeightAt) tgt.pos.y = Math.max(tgt.pos.y, groundHeightAt(tgt.pos.x, tgt.pos.z) + 1.2)
      if (!cur) cur = { pos: { ...tgt.pos }, look: { ...tgt.look }, fov: tgt.fov }
      const k = mode === 'chase' ? 7 : 4
      for (const key of ['x', 'y', 'z'] as const) {
        cur.pos[key] = damp(cur.pos[key], tgt.pos[key], k, dt)
        cur.look[key] = damp(cur.look[key], tgt.look[key], k * 1.6, dt)
      }
      cur.fov = damp(cur.fov, tgt.fov, 3, dt)
      cam.position.set(cur.pos.x, cur.pos.y, cur.pos.z)
      cam.lookAt(cur.look.x, cur.look.y, cur.look.z)
      if (Math.abs(cam.fov - cur.fov) > 0.01) {
        cam.fov = cur.fov
        cam.updateProjectionMatrix()
      }
    },
  }
}
