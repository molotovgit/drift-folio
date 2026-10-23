import type { Vec3 } from './math'

/** Plain quaternion shape shared by Rapier and our pose snapshots. */
export interface Quat {
  x: number
  y: number
  z: number
  w: number
}

/** Small allocation-light vector helpers for the physics code (Rapier returns plain objects). */
export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })

export function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1
  return scale(a, 1 / l)
}

/** Remove the component of `v` along unit normal `n` and renormalise (project onto a plane). */
export const projectOnPlane = (v: Vec3, n: Vec3): Vec3 => norm(sub(v, scale(n, dot(v, n))))

/** Rotate vector v by quaternion q (v' = q v q*). */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const { x, y, z, w } = q
  const ix = w * v.x + y * v.z - z * v.y
  const iy = w * v.y + z * v.x - x * v.z
  const iz = w * v.z + x * v.y - y * v.x
  const iw = -x * v.x - y * v.y - z * v.z
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  }
}

/** Normalised lerp between quaternions along the shorter arc (good enough between physics ticks). */
export function nlerpQuat(a: Quat, b: Quat, t: number): Quat {
  const s = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1
  const x = a.x + (b.x * s - a.x) * t
  const y = a.y + (b.y * s - a.y) * t
  const z = a.z + (b.z * s - a.z) * t
  const w = a.w + (b.w * s - a.w) * t
  const l = Math.hypot(x, y, z, w) || 1
  return { x: x / l, y: y / l, z: z / l, w: w / l }
}

/** Rotation about +Y; positive yaw turns +Z (forward) toward +X (left). */
export const yawQuat = (yaw: number): Quat => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
