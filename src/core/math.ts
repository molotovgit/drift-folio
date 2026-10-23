export interface Vec2 {
  x: number
  y: number
}
export interface Vec3 {
  x: number
  y: number
  z: number
}

export const DEG = 180 / Math.PI
export const RAD = Math.PI / 180

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const len2 = (v: Vec2) => Math.hypot(v.x, v.y)
export const len3 = (v: Vec3) => Math.hypot(v.x, v.y, v.z)

/**
 * Ground-plane projection used by all gameplay maths. World is three.js
 * (+Y up, car forward +Z). Mapping (x, z) -> (x, -z) gives a standard
 * math frame where a positive angle (counter-clockwise) means "to the left".
 */
export const toGround = (v: Vec3): Vec2 => ({ x: v.x, y: -v.z })
export const fromGround = (v: Vec2, y = 0): Vec3 => ({ x: v.x, y, z: -v.y })

/** Signed angle in radians from a to b, CCW positive, -PI..PI. */
export function signedAngle(a: Vec2, b: Vec2): number {
  return Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y)
}

/** Critically damped spring step toward target (scalar). */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt))
}
