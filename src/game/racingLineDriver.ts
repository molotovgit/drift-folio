import { idleControls, type ControlState } from '../core/input'
import { clamp, type Vec2, type Vec3 } from '../core/math'
import type { Telemetry } from '../vehicle/driftCar'
import { carConfig } from '../vehicle/carConfig'
import type { RoadNetwork } from '../world/roadNetwork'
import { radii } from '../world/spline'

const G = 9.81

/** Tuning for the scripted driver. Units: metres, seconds, m/s. */
export interface RacingLineOptions {
  /** tyre friction the speed plan assumes */
  mu: number
  /** share of the grip limit the speed plan uses (spec: 0.85) */
  gripMargin: number
  /** absolute speed cap, m/s */
  maxSpeed: number
  /** deceleration the speed plan assumes when braking for a corner, m/s² */
  planDecel: number
  /** pure-pursuit look-ahead = lookBase + lookPerSpeed · speed, clamped to [lookMin, lookMax] */
  lookBase: number
  lookPerSpeed: number
  lookMin: number
  lookMax: number
  /** corners tighter than this |radius| get a handbrake tap on entry, metres */
  hairpinRadius: number
  /** speed cap through hairpins, m/s: a handbrake slide carries speed wide, so enter slow */
  hairpinSpeed: number
  /** how long a handbrake tap lasts, seconds */
  tapSeconds: number
  /** minimum speed for a handbrake tap to be worth it, m/s */
  tapMinSpeed: number
  /** throttle held while sliding through a hairpin, 0..1 */
  driftThrottle: number
  /**
   * aim from the nose (0) or the velocity (1). Aiming from the nose damps yaw
   * oscillation; on the Systems Drop 0 tracked best (1 wandered off the road).
   */
  courseBlend: number
  /** |steer| cap while gripping: full input is the grip limit, which breaks the rear loose */
  gripSteerMax: number
  /** degrees of slip over which the driver lifts off the throttle when not drifting on purpose */
  tcSlipRange: number
}

export const DEFAULT_RACING_LINE: RacingLineOptions = {
  // the arcade tyre model's usable lateral grip is below the nominal mu (slip curve,
  // traction cap, load transfer), so the speed plan assumes less
  mu: 0.9,
  gripMargin: 0.85,
  maxSpeed: 38,
  planDecel: 4.5,
  lookBase: 5,
  lookPerSpeed: 0.45,
  lookMin: 7,
  lookMax: 24,
  hairpinRadius: 18,
  hairpinSpeed: 11,
  tapSeconds: 0.25,
  tapMinSpeed: 11,
  driftThrottle: 0.45,
  courseBlend: 0,
  gripSteerMax: 0.8,
  tcSlipRange: 5,
}

/** One centreline sample of the joined route. */
interface PathPoint {
  pos: Vec3
  /** arc length from the route start, metres */
  s: number
  /** signed turn radius (+ = left, same convention as RoadEdge.radius), metres; Infinity on straights */
  radius: number
  /** which hairpin this sample belongs to (-1 = none), so each gets one tap */
  hairpin: number
}

/**
 * A scripted driver for recording the ghost lap. It follows the centreline of
 * a chain of road edges with pure-pursuit steering, plans speed from the
 * curvature ahead (v = sqrt(mu·g·R·margin), braking-distance aware), and taps
 * the handbrake on entry to tight hairpins so the car actually drifts them.
 *
 * Conventions (same as DriftCar): world forward +Z, left +X; ControlState
 * steer +1 = right. Call `controls` once per physics tick with the car's
 * telemetry; the driver is stateful (progress along the route, tap timers).
 */
export class RacingLineDriver {
  private readonly path: PathPoint[]
  private readonly opts: RacingLineOptions
  /** index of the path sample nearest the car (never decreases) */
  private idx = 0
  /** seconds of handbrake tap remaining */
  private tapT = 0
  private readonly tapped = new Set<number>()

  constructor(roads: RoadNetwork, edgeIds: readonly string[], opts: Partial<RacingLineOptions> = {}) {
    this.opts = { ...DEFAULT_RACING_LINE, ...opts }
    this.path = RacingLineDriver.buildPath(roads, edgeIds, this.opts.hairpinRadius)
  }

  /** Total route length, metres. */
  get length(): number {
    return this.path[this.path.length - 1].s
  }

  /** Distance driven along the route (by nearest centreline sample), metres. */
  get progress(): number {
    return this.path[this.idx].s
  }

  /** First centreline point of the route. */
  get start(): Vec3 {
    return this.path[0].pos
  }

  /** Last centreline point of the route. */
  get end(): Vec3 {
    return this.path[this.path.length - 1].pos
  }

  /** True once the car is within `margin` metres of the end of the route. */
  finished(margin = 3): boolean {
    return this.progress >= this.length - margin
  }

  /** Controls for this tick. `dt` (seconds since the last call) runs the handbrake-tap timer. */
  controls(t: Telemetry, dt = 1 / 60): ControlState {
    this.track(t.pos)
    const c = idleControls()
    const look = clamp(this.opts.lookBase + this.opts.lookPerSpeed * t.speed, this.opts.lookMin, this.opts.lookMax)
    const target = this.pointAt(this.progress + look)
    c.steer = this.steerToward(t, target.pos, look)
    this.speedControl(t, c)
    this.handbrakeTaps(t, c, dt)
    return c
  }

  /**
   * Steering command toward a world point. The sign comes from the cross
   * product of the direction of travel and the target direction in the ground
   * frame (math frame, CCW positive = left), so a target on the left gives
   * steer < 0. The direction of travel blends the nose and the velocity by
   * `courseBlend` (nose only when nearly stopped).
   * Magnitude: pure-pursuit wheel angle delta = atan(2·L·sin(alpha) / d),
   * normalised by the lock DriftCar allows at this speed when gripping, and
   * capped at `gripSteerMax` while gripping above 12 m/s.
   */
  steerToward(t: Pick<Telemetry, 'pos' | 'heading' | 'vel' | 'speed' | 'drifting'>, target: Vec3, dist: number): number {
    const d: Vec2 = { x: target.x - t.pos.x, y: -(target.z - t.pos.z) } // ground frame: (x, -z)
    const dl = Math.hypot(d.x, d.y) || 1
    const k = t.speed > 3 ? this.opts.courseBlend : 0
    const hx = t.heading.x * (1 - k) + (t.vel.x / Math.max(t.speed, 1e-6)) * k
    const hy = t.heading.y * (1 - k) - (t.vel.z / Math.max(t.speed, 1e-6)) * k
    const hl = Math.hypot(hx, hy) || 1
    const h = { x: hx / hl, y: hy / hl }
    const cross = h.x * d.y - h.y * d.x // > 0: target is to the left
    const alpha = Math.atan2(cross, h.x * d.x + h.y * d.y)
    const wheel = Math.atan((2 * carConfig.wheelbase * Math.sin(alpha)) / Math.max(dist, dl, 1))
    // mirror DriftCar.updateSteering: available lock shrinks with speed unless drifting
    const gripLock = Math.atan((carConfig.wheelbase * carConfig.mu * G * carConfig.steerGripMargin) / Math.max(t.speed * t.speed, 1))
    const minLock = (carConfig.highSpeedSteerDeg * 0.25 * Math.PI) / 180
    const maxLock = (carConfig.maxSteerDeg * Math.PI) / 180
    const lock = t.drifting ? maxLock : clamp(gripLock, minLock, maxLock)
    const cap = t.drifting || t.speed < 12 ? 1 : this.opts.gripSteerMax
    return clamp(-wheel / lock, -cap, cap)
  }

  /** Target speed now: the corner limit of every sample ahead, minus the braking distance to it. */
  targetSpeed(): number {
    const { mu, gripMargin, maxSpeed, planDecel } = this.opts
    const here = this.progress
    let v = maxSpeed
    // look as far as it takes to brake from maxSpeed to a standstill
    const horizon = (maxSpeed * maxSpeed) / (2 * planDecel)
    for (let i = this.idx; i < this.path.length && this.path[i].s - here <= horizon; i++) {
      const r = Math.abs(this.path[i].radius)
      if (!Number.isFinite(r)) continue
      const grip = Math.sqrt(mu * G * r * gripMargin)
      const corner = this.path[i].hairpin >= 0 ? Math.min(grip, this.opts.hairpinSpeed) : grip
      v = Math.min(v, Math.sqrt(corner * corner + 2 * planDecel * (this.path[i].s - here)))
    }
    return v
  }

  /** Throttle/brake to hold the target speed (proportional, with a small dead band). */
  private speedControl(t: Telemetry, c: ControlState): void {
    const err = this.targetSpeed() - t.speed
    if (err > 0) c.throttle = clamp(0.25 + err * 0.25, 0, 1)
    else if (err < -0.5) c.brake = clamp(-err * 0.35, 0, 1)
    if (!t.drifting) {
      // driver-side traction control: below the drift threshold the steering lock is
      // tiny at speed, so a power slide can't be caught with the wheel; lift as the
      // rear steps out (full throttle at 3°, none by 3° + tcSlipRange)
      c.throttle *= clamp(1 - (Math.abs(t.slipDeg) - 3) / this.opts.tcSlipRange, 0, 1)
      return
    }
    // mid-drift never brake (it spins the car). In a hairpin, part throttle lets the
    // drift assist hold the slide; anywhere else the slide is unwanted, so lift and
    // let the assist straighten the car.
    c.brake = 0
    c.throttle = this.inHairpin() && t.speed < this.opts.hairpinSpeed + 2 ? this.opts.driftThrottle : 0
  }

  /** True while the car is in, or about to enter, a hairpin. */
  private inHairpin(): boolean {
    return this.path[this.idx].hairpin >= 0 || this.pointAt(this.progress + 8).hairpin >= 0
  }

  /** One short handbrake tap per hairpin, just before its entry. */
  private handbrakeTaps(t: Telemetry, c: ControlState, dt: number): void {
    if (this.tapT > 0) {
      this.tapT -= dt
      c.handbrake = true
      return
    }
    // tap only once slowed to near the hairpin speed: a fast slide runs wide into the rail
    if (t.speed < this.opts.tapMinSpeed || t.speed > this.opts.hairpinSpeed + 2.5 || t.drifting) return
    const entry = this.pointAt(this.progress + 2 + t.speed * 0.2)
    if (entry.hairpin < 0 || this.tapped.has(entry.hairpin)) return
    this.tapped.add(entry.hairpin)
    this.tapT = this.opts.tapSeconds
    c.handbrake = true
  }

  /** Advance `idx` to the nearest sample within a window around it (never jumps to another road). */
  private track(p: Vec3): void {
    const from = Math.max(0, this.idx - 5)
    const to = Math.min(this.path.length - 1, this.idx + 40)
    let best = this.idx
    let bestD = Infinity
    for (let i = from; i <= to; i++) {
      const q = this.path[i].pos
      const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    this.idx = Math.max(this.idx, best)
  }

  /** Path sample at arc length `s` (clamped to the route). */
  private pointAt(s: number): PathPoint {
    let i = this.idx
    while (i < this.path.length - 1 && this.path[i].s < s) i++
    return this.path[i]
  }

  /** Join edge centrelines (dropping duplicated joint samples), compute radii and label hairpins. */
  private static buildPath(roads: RoadNetwork, edgeIds: readonly string[], hairpinRadius: number): PathPoint[] {
    if (!edgeIds.length) throw new Error('RacingLineDriver: no edges')
    const path: PathPoint[] = []
    let base = 0
    for (const id of edgeIds) {
      const e = roads.edge(id)
      e.points.forEach((p, i) => {
        if (path.length && i === 0) return // same point as the previous edge's last
        path.push({ pos: p, s: base + e.dist[i], radius: Infinity, hairpin: -1 })
      })
      base += e.length
    }
    // radii over the joined route: per-edge radii cannot see the kink where two edges meet at a node
    const r = radii(path.map((p) => ({ x: p.pos.x, y: p.pos.z })))
    path.forEach((p, i) => (p.radius = r[i]))
    let label = -1
    for (let i = 0; i < path.length; i++) {
      const tight = Math.abs(path[i].radius) < hairpinRadius
      if (tight && (i === 0 || path[i - 1].hairpin < 0)) label++
      if (tight) path[i].hairpin = label
    }
    return path
  }
}
