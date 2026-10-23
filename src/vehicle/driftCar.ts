import RAPIER from '@dimforge/rapier3d-compat'
import type { ControlState } from '../core/input'
import { clamp, damp, RAD, toGround, type Vec2, type Vec3 } from '../core/math'
import { dot, lerp3, nlerpQuat, rotate, scale, v3, yawQuat, type Quat } from '../core/vec3'
import { carConfig, type CarConfig } from './carConfig'
import { DriftController } from './driftController'
import { DriftCommand, isDrifting, slipAngleDeg } from './driftMath'
import { WallGraze } from './wallGraze'
import { Wheel, type WheelState } from './wheel'

// re-exported so world builders and tests can keep importing from the car module
export { surfaceOf, type WheelState } from './wheel'
export { yawQuat } from '../core/vec3'

/** Snapshot of the car for gameplay, camera and HUD. */
export interface Telemetry {
  pos: Vec3
  /** forward direction on the ground plane (math frame, see core/math toGround) */
  heading: Vec2
  vel: Vec3
  /** horizontal speed, m/s */
  speed: number
  /** body slip angle β, degrees, left positive */
  slipDeg: number
  drifting: boolean
  wheelsOnGround: number
  /** at least one wheel is on a collider tagged as road */
  onRoad: boolean
  yaw: number
  throttle: number
}

/** Body + wheel-hub transform used for rendering. */
export interface Pose {
  pos: Vec3
  rot: Quat
  wheels: Vec3[]
}

const UP = v3(0, 1, 0)
const FORWARD = v3(0, 0, 1)
const LEFT = v3(1, 0, 0)
/** front-wheel angle the steer input adds on top of the counter-steer while drifting, degrees */
const DRIFT_STEER_SHOW_DEG = 12

/**
 * The "FD": a Rapier rigid body on four raycast wheels with an arcade drift
 * model. Conventions: forward +Z, left +X, up +Y; positive yaw turns left;
 * steer +1 = right. Physics runs in fixed ticks via `update`; rendering reads
 * `pose(alpha)` to interpolate between ticks.
 */
export class DriftCar {
  readonly body: RAPIER.RigidBody
  private readonly wheelList: Wheel[]
  private readonly drift: DriftController
  private readonly graze = new WallGraze()
  private readonly driftCommand = new DriftCommand()
  /** the box that reports hard contacts (crash rule, wall graze) */
  private readonly chassis: RAPIER.Collider
  private steerAngle = 0
  private lastThrottle = 0
  private prevPose: Pose | null = null

  constructor(
    private readonly world: RAPIER.World,
    start: Vec3,
    startYaw = 0,
    private readonly cfg: CarConfig = carConfig,
  ) {
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(start.x, start.y + cfg.comHeight + 0.1, start.z)
        .setRotation(yawQuat(startYaw))
        .setAdditionalMassProperties(cfg.mass, { x: 0, y: 0, z: 0 }, cfg.inertia, { x: 0, y: 0, z: 0, w: 1 })
        .setAngularDamping(cfg.angularDamping)
        .setCanSleep(false)
        .setCcdEnabled(true),
    )
    // chassis box (reports hard contacts for the crash rule) + rounded roof so rollovers don't snag
    // the chassis is the only car collider that emits contact-force events
    this.chassis = world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.86, 0.27, 2.1)
        .setTranslation(0, 0.22, 0)
        .setDensity(0)
        .setFriction(0.25)
        .setRestitution(0.15)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(9000),
      this.body,
    )
    world.createCollider(
      RAPIER.ColliderDesc.capsule(0.6, 0.45).setRotation({ x: 0.7071, y: 0, z: 0, w: 0.7071 }).setTranslation(0, 0.55, 0.1).setDensity(0).setFriction(0.2),
      this.body,
    )

    const hx = cfg.track / 2
    const hz = cfg.wheelbase / 2
    // order matters (visuals map to it): front-left, front-right, rear-left, rear-right
    this.wheelList = [
      new Wheel(v3(hx, cfg.mountY, hz), true, cfg),
      new Wheel(v3(-hx, cfg.mountY, hz), true, cfg),
      new Wheel(v3(hx, cfg.mountY, -hz), false, cfg),
      new Wheel(v3(-hx, cfg.mountY, -hz), false, cfg),
    ]
    this.drift = new DriftController(cfg)
  }

  /** Read-only wheel states (index order: FL, FR, RL, RR). */
  wheels(): readonly WheelState[] {
    return this.wheelList.map((w) => w.state)
  }

  telemetry(): Telemetry {
    const p = this.body.translation()
    const lv = this.body.linvel()
    const fwd = rotate(this.body.rotation(), FORWARD)
    const heading = toGround(fwd)
    const hl = Math.hypot(heading.x, heading.y) || 1
    const h2 = { x: heading.x / hl, y: heading.y / hl }
    const vg = toGround(lv)
    const speed = Math.hypot(vg.x, vg.y)
    // reversing is not drifting
    const slipDeg = dot(lv, fwd) < -0.5 ? 0 : slipAngleDeg(h2, vg)
    const contacts = this.wheelList.filter((w) => w.state.contact)
    return {
      pos: { x: p.x, y: p.y, z: p.z },
      heading: h2,
      vel: { x: lv.x, y: lv.y, z: lv.z },
      speed,
      slipDeg,
      drifting: isDrifting(slipDeg, speed) && contacts.length >= 2,
      wheelsOnGround: contacts.length,
      onRoad: contacts.some((w) => w.state.surface === 'road'),
      yaw: Math.atan2(fwd.x, fwd.z),
      throttle: this.lastThrottle,
    }
  }

  /** Body and wheel-hub pose blended between the last two physics ticks. */
  pose(alpha: number): Pose {
    const cur = this.currentPose()
    const prev = this.prevPose
    if (!prev) return cur
    return {
      pos: lerp3(prev.pos, cur.pos, alpha),
      rot: nlerpQuat(prev.rot, cur.rot, alpha),
      wheels: cur.wheels.map((w, i) => lerp3(prev.wheels[i] ?? w, w, alpha)),
    }
  }

  /** One fixed physics tick of `h` seconds. Call before `world.step()`. */
  update(c: ControlState, h: number): void {
    this.prevPose = this.currentPose()
    this.lastThrottle = c.throttle
    this.graze.tick(h)
    const t0 = this.telemetry()
    const rot = this.body.rotation()
    const lv = this.body.linvel()
    const fwd = rotate(rot, FORWARD)
    const forwardSpeed = dot(lv, fwd)
    const drift = this.driftCommand.resolve(c, t0.slipDeg, t0.speed)
    // the handbrake with no direction to drift in just slows the car; only while
    // rolling forward, since the brake pedal at a standstill means reverse
    const slowing = c.handbrake && drift === 0 && forwardSpeed > 0.8
    const pedals = slowing ? { ...c, brake: Math.max(c.brake, this.cfg.handbrakeBrake) } : c
    const driveForce = c.throttle > 0 ? Math.min(this.cfg.maxDriveForce, this.cfg.powerW / Math.max(Math.abs(forwardSpeed), 4)) * c.throttle : 0

    this.updateSteering(c, t0, h)

    const ctx = {
      world: this.world,
      body: this.body,
      pos: this.body.translation(),
      rot,
      linvel: lv,
      angvel: this.body.angvel(),
      up: rotate(rot, UP),
      fwd,
      left: rotate(rot, LEFT),
      forwardSpeed,
      controls: pedals,
      // the drift controller takes the horizontal tyre forces over as it blends in
      tyreScale: 1 - this.drift.mix,
      driveForce,
      h,
    }
    for (const w of this.wheelList) w.simulate(ctx, w.front ? this.steerAngle : 0)

    this.applyAeroDrag(lv, h)
    this.drift.step(
      this.body,
      { drift, steer: c.steer, throttle: c.throttle, brake: pedals.brake },
      {
        up: ctx.up,
        fwd,
        linvel: lv,
        angvel: ctx.angvel,
        slipRad: t0.slipDeg * RAD,
        contactShare: this.wheelList.filter((w) => w.state.contact).length / this.wheelList.length,
        driveForce,
      },
      h,
    )
  }

  /**
   * A guard-rail contact-force event involving the chassis: scrub
   * some speed and carry on along the wall. Call after `world.step()`.
   */
  grazeWall(e: { collider2(): number; maxForceDirection(): Vec3 }): boolean {
    // Rapier's direction is the force on collider2 (normal from collider1 to collider2),
    // checked both ways round in wallGraze.sim.test: away from the wall when that is the chassis
    const d = e.maxForceDirection()
    const sign = e.collider2() === this.chassis.handle ? 1 : -1
    return this.graze.apply(this.body, scale(d, sign))
  }

  /** 0 = plain tyre grip, 1 = the twin-axis drift controller owns the tyre forces. */
  get driftMix(): number {
    return this.drift.mix
  }

  /** Teleport to a ground position facing `yaw`, clearing all motion and controller state. */
  resetTo(pos: Vec3, yaw: number): void {
    this.body.setTranslation({ x: pos.x, y: pos.y + this.cfg.comHeight + 0.15, z: pos.z }, true)
    this.body.setRotation(yawQuat(yaw), true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.steerAngle = 0
    this.lastThrottle = 0
    this.prevPose = null
    this.drift.reset()
    this.graze.reset()
    this.driftCommand.reset()
    for (const w of this.wheelList) w.reset()
  }

  /** Pose from the current (post-step) transform; hubs follow the body, not last tick's raycast. */
  private currentPose(): Pose {
    const p = this.body.translation()
    const r = this.body.rotation()
    const pos = { x: p.x, y: p.y, z: p.z }
    const rot = { x: r.x, y: r.y, z: r.z, w: r.w }
    return { pos, rot, wheels: this.wheelList.map((w) => w.hubAt(pos, rot)) }
  }

  /**
   * While gripping, lock is limited to what the tyres can hold at this speed (full
   * input ≈ the grip limit, like an arcade racer). As the drift controller blends
   * in, the front wheels point along the path (natural counter-steer, visual: the
   * tyres no longer carry the cornering force) plus a little of the steer input.
   */
  private updateSteering(c: ControlState, t0: Telemetry, h: number): void {
    const { cfg } = this
    const gripLockDeg = Math.atan((cfg.wheelbase * cfg.mu * 9.81 * cfg.steerGripMargin) / Math.max(t0.speed * t0.speed, 1)) / RAD
    const lockDeg = clamp(gripLockDeg, cfg.highSpeedSteerDeg * 0.25, cfg.maxSteerDeg)
    // steer +1 (right) is a negative wheel yaw; a right-hand slide (slip > 0) has the path to the left (+)
    const gripAngle = -c.steer * lockDeg * RAD
    const driftAngle = clamp(t0.slipDeg - c.steer * DRIFT_STEER_SHOW_DEG, -cfg.maxSteerDeg, cfg.maxSteerDeg) * RAD
    const mix = this.drift.mix
    this.steerAngle = damp(this.steerAngle, gripAngle * (1 - mix) + driftAngle * mix, cfg.steerSpeed, h)
  }

  /** Quadratic drag from the velocity at the start of the tick (before wheel impulses). */
  private applyAeroDrag(lv: Vec3, h: number): void {
    const speed = Math.hypot(lv.x, lv.y, lv.z)
    this.body.applyImpulse(scale(lv, -this.cfg.dragCoeff * speed * h), true)
  }
}
