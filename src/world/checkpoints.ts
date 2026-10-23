import type { Vec3 } from '../core/math'
import type { RoadNetwork } from './roadNetwork'

/** A place the car can be reset to: on the road centreline, facing along it. */
export interface Checkpoint {
  pos: Vec3
  yaw: number
  edgeId: string
}

export type ResetReason = 'fell' | 'stuck'

/** Spacing of checkpoints along every road (plan Task 3.4). */
export const CHECKPOINT_SPACING = 50
/** off-road and slower than this for STUCK_SECONDS → auto reset */
const STUCK_SPEED = 0.5
export const STUCK_SECONDS = 4
/** further than this below the ground → fell out of the world */
const FALL_DEPTH = 15
/** the car "passes" a checkpoint when within this distance of it */
const PASS_RADIUS = 10

/** What Checkpoints needs to know about the car each frame. */
export interface CarState {
  pos: Vec3
  speed: number
  onRoad: boolean
  wheelsOnGround: number
}

/**
 * Tracks the last checkpoint the car passed and detects when it is stuck or has
 * fallen out of the world (Review Focus #2). R always resets to `last`.
 */
export class Checkpoints {
  readonly all: Checkpoint[] = []
  private lastPassed: Checkpoint
  private stuckFor = 0

  constructor(
    roads: RoadNetwork,
    /** ground height under (x, z), for the fall check */
    private readonly groundAt: (x: number, z: number) => number,
    start: Checkpoint,
  ) {
    for (const e of roads.edges) {
      for (let d = 0; d < e.length; d += CHECKPOINT_SPACING) {
        const i = Math.min(e.points.length - 1, Math.round(d / (e.length / (e.points.length - 1))))
        const t = e.tangent(i)
        this.all.push({ pos: { ...e.points[i] }, yaw: Math.atan2(t.x, t.y), edgeId: e.id })
      }
    }
    this.lastPassed = start
  }

  get last(): Checkpoint {
    return this.lastPassed
  }

  /** Call every frame; returns a reason when the car should be reset automatically. */
  update(car: CarState, dt: number): ResetReason | null {
    if (car.pos.y < this.groundAt(car.pos.x, car.pos.z) - FALL_DEPTH) return this.resetTimers('fell')

    if (car.onRoad) {
      const near = this.nearest(car.pos, PASS_RADIUS)
      if (near) this.lastPassed = near
    }

    const offRoadSlow = !car.onRoad && car.speed < STUCK_SPEED
    const beached = car.wheelsOnGround === 0 && car.speed < STUCK_SPEED // on its roof or hung up
    this.stuckFor = offRoadSlow || beached ? this.stuckFor + dt : 0
    if (this.stuckFor >= STUCK_SECONDS) return this.resetTimers('stuck')
    return null
  }

  /** Nearest checkpoint within maxDist (horizontal), or null. */
  nearest(p: Vec3, maxDist = Infinity): Checkpoint | null {
    let best: Checkpoint | null = null
    let bestD = maxDist
    for (const c of this.all) {
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z)
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    return best
  }

  private resetTimers(reason: ResetReason): ResetReason {
    this.stuckFor = 0
    return reason
  }
}
