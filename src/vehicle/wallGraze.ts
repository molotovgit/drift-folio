import type RAPIER from '@dimforge/rapier3d-compat'
import { clamp, type Vec3 } from '../core/math'
import { add, dot, scale, v3 } from '../core/vec3'

/** Speed lost on a dead-parallel touch, share of speed. */
const BASE_LOSS = 0.05
/** Extra loss per unit of (into-wall speed / speed), i.e. per sin(impact angle). */
const ANGLE_LOSS = 0.5
/** Most speed one graze can cost, share of speed (~20 km/h at 100 km/h). */
const MAX_LOSS = 0.22
/** Sideways speed the wall hands back, pushing the car off it, m/s. */
const BOUNCE = 1.2
/** Share of the yaw rate kept after a graze, so a wall touch does not start a spin. */
const YAW_KEEP = 0.5
/** One graze per contact: further force events within this window are ignored, s. */
const COOLDOWN = 0.35
/** Ignore touches slower than this into the wall, m/s (resting against it). */
const MIN_IN_SPEED = 0.3

/**
 * Arcade wall graze: a guard-rail touch scrubs a modest share of speed and
 * sends the car on along the wall instead of stopping it dead. The into-wall
 * velocity is replaced with a small bounce, the rest is kept along the wall,
 * and the yaw rate is calmed. Fed by the chassis' Rapier contact-force events.
 */
export class WallGraze {
  private cooldown = 0

  /** Advance the cooldown by one physics tick. */
  tick(h: number): void {
    this.cooldown = Math.max(0, this.cooldown - h)
  }

  reset(): void {
    this.cooldown = 0
  }

  /**
   * Apply a graze from a contact force direction (either sign; only its
   * horizontal part is used). Returns true if it changed the car's motion.
   */
  apply(body: RAPIER.RigidBody, forceDir: Vec3): boolean {
    if (this.cooldown > 0) return false
    const flat = Math.hypot(forceDir.x, forceDir.z)
    if (flat < 0.3) return false // a floor or roof contact, not a wall
    const v = body.linvel()
    const vFlat = v3(v.x, 0, v.z)
    const speed = Math.hypot(v.x, v.z)
    // wall normal pointing away from the wall, i.e. against the car's motion into it
    let n = v3(forceDir.x / flat, 0, forceDir.z / flat)
    if (dot(vFlat, n) > 0) n = scale(n, -1)
    const vIn = -dot(vFlat, n)
    if (vIn < MIN_IN_SPEED || speed < 1) return false

    const along = add(vFlat, scale(n, vIn)) // velocity with the into-wall part removed
    const loss = clamp(BASE_LOSS + (ANGLE_LOSS * vIn) / speed, 0, MAX_LOSS)
    const out = add(scale(along, 1 - loss), scale(n, BOUNCE))
    body.setLinvel({ x: out.x, y: v.y, z: out.z }, true)
    const w = body.angvel()
    body.setAngvel({ x: w.x, y: w.y * YAW_KEEP, z: w.z }, true)
    this.cooldown = COOLDOWN
    return true
  }
}
