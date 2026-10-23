import RAPIER from '@dimforge/rapier3d-compat'
import type { ControlState } from '../core/input'
import { clamp, RAD, type Vec3 } from '../core/math'
import { add, cross, dot, norm, projectOnPlane, rotate, scale, sub, v3, type Quat } from '../core/vec3'
import type { CarConfig } from './carConfig'
import { lateralGrip } from './driftMath'

/** Public, read-only view of a wheel for visuals, smoke and skid marks. */
export interface WheelState {
  /** world-space hub position from the last tick */
  pos: Vec3
  steerRad: number
  spin: number
  contact: boolean
  /** world contact point (valid when contact) */
  contactPoint: Vec3
  /** 0..1 how much this tyre is sliding (drives smoke/skids) */
  slide: number
  /** surface tag of the collider under the tyre ('road', 'terrain', …) or null */
  surface: string | null
}

/** Everything a wheel needs from its car for one physics tick. */
export interface WheelContext {
  world: RAPIER.World
  body: RAPIER.RigidBody
  pos: Vec3
  rot: Quat
  linvel: Vec3
  angvel: Vec3
  up: Vec3
  fwd: Vec3
  left: Vec3
  forwardSpeed: number
  controls: ControlState
  /** rear lateral grip multiplier (handbrake / clutch kick / power-over) */
  rearGripScale: number
  /** total drive force at the rear axle, N */
  driveForce: number
  drifting: boolean
  clutchKicking: boolean
  h: number
}

/** Surface tag per collider handle (set by world builders, read by wheels). */
export const surfaceOf = new Map<number, string>()

/**
 * One raycast wheel: spring-damper suspension plus an arcade tyre model
 * (slip-angle grip curve inside a friction circle). Applies its forces to the
 * car body as impulses at the contact point.
 */
export class Wheel {
  readonly state: WheelState = { pos: v3(), steerRad: 0, spin: 0, contact: false, contactPoint: v3(), slide: 0, surface: null }
  /** hub distance below the mount along the body's down axis, from the last tick */
  drop: number
  private prevCompression = 0
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
  private readonly rayLength: number
  private readonly shareMass: number

  constructor(
    /** mount point relative to the centre of mass (forward +Z, left +X) */
    readonly mount: Vec3,
    readonly front: boolean,
    private readonly cfg: CarConfig,
  ) {
    this.drop = cfg.restLength
    this.rayLength = cfg.restLength + cfg.wheelRadius
    this.shareMass = cfg.mass / 4
  }

  /** Hub position for a given body transform (used for interpolated rendering). */
  hubAt(pos: Vec3, rot: Quat): Vec3 {
    return add(pos, rotate(rot, { x: this.mount.x, y: this.mount.y - this.drop, z: this.mount.z }))
  }

  reset(): void {
    this.prevCompression = 0
    this.drop = this.cfg.restLength
    this.state.contact = false
  }

  /** Raycast, compute suspension + tyre forces, apply them. `steerRad` > 0 turns the wheel left. */
  simulate(ctx: WheelContext, steerRad: number): void {
    const { cfg } = this
    const origin = add(ctx.pos, rotate(ctx.rot, this.mount))
    const down = scale(ctx.up, -1)
    this.ray.origin = origin
    this.ray.dir = down
    const hit = ctx.world.castRayAndGetNormal(this.ray, this.rayLength, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, ctx.body)
    this.state.steerRad = steerRad

    if (!hit) {
      this.state.contact = false
      this.state.slide = 0
      this.state.surface = null
      this.prevCompression = 0
      this.drop = cfg.restLength
      this.state.pos = add(origin, scale(down, this.rayLength - cfg.wheelRadius))
      return
    }

    // --- suspension ---
    const toi = hit.timeOfImpact
    const contact = add(origin, scale(down, toi))
    const normal = norm(hit.normal)
    const compression = this.rayLength - toi
    // no damper kick on the first contact tick
    const compVel = this.state.contact ? (compression - this.prevCompression) / ctx.h : 0
    this.prevCompression = compression
    const load = Math.max(0, cfg.springK * compression + cfg.damperC * compVel)

    // --- tyre frame on the contact plane ---
    const cs = Math.cos(steerRad)
    const sn = Math.sin(steerRad)
    const wFwd = projectOnPlane(add(scale(ctx.fwd, cs), scale(ctx.left, sn)), normal)
    const wLeft = projectOnPlane(add(scale(ctx.left, cs), scale(ctx.fwd, -sn)), normal)
    const pointVel = add(ctx.linvel, cross(ctx.angvel, sub(contact, ctx.pos)))
    const vLong = dot(pointVel, wFwd)
    const vLat = dot(pointVel, wLeft)
    const tyreSlip = Math.atan2(vLat, Math.max(Math.abs(vLong), 1.0))
    const locked = !this.front && ctx.controls.handbrake

    const { fLong, fLat } = locked ? this.lockedForces(vLong, vLat, load, ctx.h) : this.rollingForces(ctx, vLong, vLat, tyreSlip, load)

    const force = add(add(scale(normal, load), scale(wFwd, fLong)), scale(wLeft, fLat))
    ctx.body.applyImpulseAtPoint(scale(force, ctx.h), contact, true)

    // --- state for visuals / fx ---
    this.state.contact = true
    this.state.contactPoint = contact
    this.state.pos = add(contact, scale(normal, cfg.wheelRadius))
    this.drop = Math.max(0, toi - cfg.wheelRadius)
    this.state.spin += (vLong / cfg.wheelRadius) * ctx.h * (locked ? 0 : 1)
    this.state.slide = clamp(Math.abs(Math.sin(tyreSlip)) * 1.6 + (locked ? 0.5 : 0), 0, 1) * clamp(Math.abs(vLong) / 6, 0, 1)
    this.state.surface = surfaceOf.get(hit.collider.handle) ?? null
  }

  /** A locked (handbrake) tyre slides: kinetic friction opposes the whole slip velocity. */
  private lockedForces(vLong: number, vLat: number, load: number, h: number) {
    const slipSpeed = Math.hypot(vLong, vLat)
    if (slipSpeed <= 1e-3) return { fLong: 0, fLat: 0 }
    const fk = Math.min(this.cfg.lockedFriction * this.cfg.mu * load, (slipSpeed * this.shareMass) / h)
    return { fLong: (-vLong / slipSpeed) * fk, fLat: (-vLat / slipSpeed) * fk }
  }

  /** Rolling tyre: drive/brake/rolling resistance, then lateral grip from what's left of the friction circle. */
  private rollingForces(ctx: WheelContext, vLong: number, vLat: number, tyreSlip: number, load: number) {
    const { cfg } = this
    const c = ctx.controls
    const maxF = cfg.mu * load * (this.front ? 1 : ctx.rearGripScale)
    let fLong = 0
    if (!this.front) {
      if (c.throttle > 0) {
        // Traction control: drive leaves room for cornering grip unless the driver
        // is deliberately breaking traction (clutch kick or already drifting).
        const steerUse = Math.min(1, Math.abs(c.steer) * 2)
        const tcCap = ctx.clutchKicking || ctx.drifting ? Infinity : maxF * (1 - (1 - cfg.tractionLimit) * steerUse)
        fLong += Math.min(ctx.driveForce / 2, tcCap)
      }
      if (c.brake > 0 && ctx.forwardSpeed <= 0.8 && ctx.forwardSpeed > -cfg.maxReverseSpeed) fLong -= (cfg.reverseForce * c.brake) / 2
    }
    if (c.brake > 0 && ctx.forwardSpeed > 0.8) {
      const share = this.front ? cfg.brakeFrontShare / 2 : (1 - cfg.brakeFrontShare) / 2
      fLong -= Math.sign(vLong) * Math.min(cfg.brakeForce * share * c.brake, (Math.abs(vLong) * this.shareMass) / ctx.h)
    }
    fLong -= (vLong * cfg.rollingCoeff) / 4

    fLong = clamp(fLong, -maxF, maxF)
    const latCap = Math.sqrt(Math.max(0, maxF * maxF - fLong * fLong))
    const slideFactor = this.front ? cfg.frontSlide : cfg.rearSlide
    let fLat = -Math.sign(vLat) * lateralGrip(tyreSlip, cfg.peakSlipDeg * RAD, slideFactor) * latCap
    // never push past zero lateral velocity in one step (low-speed jitter)
    const stopLat = (Math.abs(vLat) * this.shareMass) / ctx.h
    fLat = clamp(fLat, -stopLat, stopLat)
    return { fLong, fLat }
  }
}
