import RAPIER from '@dimforge/rapier3d-compat'
import type { ControlState } from '../core/input'
import { clamp, damp, lerp, RAD, toGround, type Vec2, type Vec3 } from '../core/math'
import { carConfig, type CarConfig } from './carConfig'
import { CLUTCH_KICK_SECONDS, counterSteerAssist, isDrifting, lateralGrip, rearGripScale, slipAngleDeg } from './driftMath'

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

export interface WheelState {
  /** world-space hub position */
  pos: Vec3
  steerRad: number
  spin: number
  contact: boolean
  /** world contact point (valid when contact) */
  contactPoint: Vec3
  /** 0..1 how much this tyre is sliding (drives smoke/skids) */
  slide: number
  surface: string | null
}

export interface DriftCar {
  body: RAPIER.RigidBody
  update(c: ControlState, h: number): void
  telemetry(): Telemetry
  wheels(): readonly WheelState[]
  resetTo(p: Vec3, yaw: number): void
}

interface Wheel {
  mount: Vec3 // local, relative to CoM
  front: boolean
  prevCompression: number
  state: WheelState
}

const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1
  return scale(a, 1 / l)
}

function rotate(q: RAPIER.Rotation, v: Vec3): Vec3 {
  // v' = q v q*
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

export const yawQuat = (yaw: number) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })

/** Surface tag stored on colliders: collider.userData-like map by handle. */
export const surfaceOf = new Map<number, string>()

export function createDriftCar(world: RAPIER.World, start: Vec3, startYaw = 0, cfg: CarConfig = carConfig): DriftCar {
  const desc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(start.x, start.y + cfg.comHeight + 0.1, start.z)
    .setRotation(yawQuat(startYaw))
    .setAdditionalMassProperties(cfg.mass, { x: 0, y: 0, z: 0 }, cfg.inertia, { x: 0, y: 0, z: 0, w: 1 })
    .setAngularDamping(cfg.angularDamping)
    .setCanSleep(false)
    .setCcdEnabled(true)
  const body = world.createRigidBody(desc)
  const chassis = RAPIER.ColliderDesc.cuboid(0.86, 0.27, 2.1)
    .setTranslation(0, 0.22, 0)
    .setDensity(0)
    .setFriction(0.25)
    .setRestitution(0.15)
    .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
    .setContactForceEventThreshold(9000)
  world.createCollider(chassis, body)
  // a rounded roof so rolling over does not stick on edges
  world.createCollider(RAPIER.ColliderDesc.capsule(0.6, 0.45).setRotation({ x: 0.7071, y: 0, z: 0, w: 0.7071 }).setTranslation(0, 0.55, 0.1).setDensity(0).setFriction(0.2), body)

  const hx = cfg.track / 2
  const hz = cfg.wheelbase / 2
  const mk = (x: number, z: number, front: boolean): Wheel => ({
    mount: v3(x, cfg.mountY, z),
    front,
    prevCompression: 0,
    state: { pos: v3(), steerRad: 0, spin: 0, contact: false, contactPoint: v3(), slide: 0, surface: null },
  })
  // forward is +Z; left is +X (see core/math)
  const wheels: Wheel[] = [mk(hx, hz, true), mk(-hx, hz, true), mk(hx, -hz, false), mk(-hx, -hz, false)]

  let steerAngle = 0
  let kickT = 0
  let prevClutch = false
  let lastThrottle = 0
  let prevSlipAbs = 0
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
  const rayLen = cfg.restLength + cfg.wheelRadius
  const wheelShareMass = cfg.mass / 4

  function telemetry(): Telemetry {
    const p = body.translation()
    const q = body.rotation()
    const lv = body.linvel()
    const fwd = rotate(q, v3(0, 0, 1))
    const heading = toGround(fwd)
    const hl = Math.hypot(heading.x, heading.y) || 1
    const h2 = { x: heading.x / hl, y: heading.y / hl }
    const vg = toGround(lv)
    const speed = Math.hypot(vg.x, vg.y)
    const slip = slipAngleDeg(h2, vg)
    // reversing is not drifting
    const forwardSpeed = dot(lv, fwd)
    const slipDeg = forwardSpeed < -0.5 ? 0 : slip
    const contacts = wheels.filter((w) => w.state.contact)
    return {
      pos: { x: p.x, y: p.y, z: p.z },
      heading: h2,
      vel: { x: lv.x, y: lv.y, z: lv.z },
      speed,
      slipDeg,
      drifting: isDrifting(slipDeg, speed) && contacts.length >= 2,
      wheelsOnGround: contacts.length,
      onRoad: contacts.some((w) => w.state.surface === 'road' || w.state.surface === null),
      yaw: Math.atan2(fwd.x, fwd.z),
      throttle: lastThrottle,
    }
  }

  function update(c: ControlState, h: number) {
    lastThrottle = c.throttle
    const t0 = telemetry()
    const p = body.translation()
    const q = body.rotation()
    const lv = body.linvel()
    const av = body.angvel()
    const up = rotate(q, v3(0, 1, 0))
    const fwd = rotate(q, v3(0, 0, 1))
    const left = rotate(q, v3(1, 0, 0))
    const forwardSpeed = dot(lv, fwd)

    // clutch kick on press
    if (c.clutch && !prevClutch && c.throttle > 0.5) kickT = CLUTCH_KICK_SECONDS
    prevClutch = c.clutch
    kickT = Math.max(0, kickT - h)

    // steering: speed-sensitive lock, full lock while sliding, assist toward the slide
    const drifting = t0.drifting
    const lockDeg = drifting ? cfg.maxSteerDeg : lerp(cfg.maxSteerDeg, cfg.highSpeedSteerDeg, clamp(t0.speed / 40, 0, 1))
    const steerCmd = counterSteerAssist(t0.slipDeg, c.steer, cfg.counterSteer, cfg.maxSteerDeg)
    steerAngle = damp(steerAngle, -steerCmd * lockDeg * RAD, cfg.steerSpeed, h)

    const rearScale = rearGripScale({ handbrake: c.handbrake, clutchKickT: kickT, throttle: c.throttle, speed: t0.speed })
    const driveTotal = c.throttle > 0 ? Math.min(cfg.maxDriveForce, cfg.powerW / Math.max(Math.abs(forwardSpeed), 4)) * c.throttle : 0
    const braking = c.brake > 0 && forwardSpeed > 0.8
    const reversing = c.brake > 0 && forwardSpeed <= 0.8

    for (const w of wheels) {
      const origin = add(p, rotate(q, w.mount))
      const down = scale(up, -1)
      ray.origin = origin
      ray.dir = down
      const hit = world.castRayAndGetNormal(ray, rayLen, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, body)
      const yawSteer = w.front ? steerAngle : 0
      // wheel frame
      const cs = Math.cos(yawSteer)
      const sn = Math.sin(yawSteer)
      let wFwd = add(scale(fwd, cs), scale(left, sn))
      let wLeft = add(scale(left, cs), scale(fwd, -sn))
      w.state.steerRad = yawSteer

      if (!hit) {
        w.state.contact = false
        w.state.slide = 0
        w.state.surface = null
        w.prevCompression = 0
        w.state.pos = add(origin, scale(down, rayLen - cfg.wheelRadius))
        continue
      }
      const toi = hit.timeOfImpact
      const contact = add(origin, scale(down, toi))
      const n = norm(hit.normal)
      const compression = rayLen - toi
      const compVel = (compression - w.prevCompression) / h
      w.prevCompression = compression
      const spring = Math.max(0, cfg.springK * compression + cfg.damperC * compVel)
      const load = spring

      // project tyre axes onto the contact plane
      wFwd = norm(sub(wFwd, scale(n, dot(wFwd, n))))
      wLeft = norm(sub(wLeft, scale(n, dot(wLeft, n))))

      const r = sub(contact, p)
      const pv = add(lv, cross(av, r))
      const vLong = dot(pv, wFwd)
      const vLat = dot(pv, wLeft)

      // longitudinal
      let fLong = 0
      if (!w.front) {
        if (c.throttle > 0) fLong += driveTotal / 2
        if (reversing && forwardSpeed > -cfg.maxReverseSpeed) fLong -= (cfg.reverseForce * c.brake) / 2
        if (c.handbrake) fLong -= Math.sign(vLong) * Math.min(Math.abs(vLong) * wheelShareMass / h, cfg.handbrakeDrag * cfg.mu * load)
      }
      if (braking) {
        const share = w.front ? cfg.brakeFrontShare / 2 : (1 - cfg.brakeFrontShare) / 2
        fLong -= Math.sign(vLong) * Math.min(cfg.brakeForce * share * c.brake, Math.abs(vLong) * wheelShareMass / h)
      }
      // rolling resistance
      fLong -= vLong * cfg.rollingCoeff / 4

      // lateral (slip-angle grip curve, friction circle)
      const tyreSlip = Math.atan2(vLat, Math.max(Math.abs(vLong), 1.0))
      const gripScale = w.front ? 1 : rearScale
      const slideFactor = w.front ? cfg.frontSlide : cfg.rearSlide
      const maxF = cfg.mu * load * gripScale
      fLong = clamp(fLong, -maxF, maxF)
      const latCap = Math.sqrt(Math.max(0, maxF * maxF - fLong * fLong))
      let fLat = -Math.sign(vLat) * lateralGrip(tyreSlip, cfg.peakSlipDeg * RAD, slideFactor) * latCap
      // never push past zero lateral velocity in one step (low-speed jitter)
      const stopLat = Math.abs(vLat) * wheelShareMass / h
      fLat = clamp(fLat, -stopLat, stopLat)

      const force = add(add(scale(n, spring), scale(wFwd, fLong)), scale(wLeft, fLat))
      body.applyImpulseAtPoint(scale(force, h), contact, true)

      w.state.contact = true
      w.state.contactPoint = contact
      w.state.pos = add(contact, scale(n, cfg.wheelRadius))
      w.state.spin += (vLong / cfg.wheelRadius) * h * (c.handbrake && !w.front ? 0 : 1)
      w.state.slide = clamp(Math.abs(Math.sin(tyreSlip)) * 1.6 + (c.handbrake && !w.front ? 0.5 : 0), 0, 1) * clamp(Math.abs(vLong) / 6, 0, 1)
      const handle = hit.collider.handle
      w.state.surface = surfaceOf.get(handle) ?? null
    }

    // aero drag
    const speed = Math.hypot(lv.x, lv.y, lv.z)
    body.applyImpulse(scale(lv, -cfg.dragCoeff * speed * h), true)

    // Drift assist (arcade): a PD controller on |slip|. Under throttle it holds the
    // slide near driftTargetDeg; past the target it always pulls the nose back so a
    // novice does not spin. Positive yaw (about +Y) turns the nose left; positive
    // slip means the car travels left of where it points.
    const slipRad = t0.slipDeg * RAD
    const slipAbs = Math.abs(slipRad)
    const dSlip = (slipAbs - prevSlipAbs) / h
    prevSlipAbs = slipAbs
    if (drifting) {
      const err = clamp(cfg.driftTargetDeg * RAD - slipAbs, -1, 1) // >0 too straight, <0 too sideways
      const gain = err > 0 ? cfg.driftHoldGain * c.throttle : cfg.driftHoldGain * (0.6 + 0.4 * c.throttle)
      const torque = -Math.sign(slipRad) * (gain * err - cfg.driftDamping * dSlip)
      body.applyTorqueImpulse(scale(up, torque * h), true)
    }
  }

  function resetTo(pos: Vec3, yaw: number) {
    body.setTranslation({ x: pos.x, y: pos.y + cfg.comHeight + 0.15, z: pos.z }, true)
    body.setRotation(yawQuat(yaw), true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    steerAngle = 0
    for (const w of wheels) w.prevCompression = 0
  }

  return { body, update, telemetry, wheels: () => wheels.map((w) => w.state), resetTo }
}
