import { MAX_FRAME } from '../core/loop'
import { routeNames, type RouteId } from '../content/projects'
import type { Hud } from '../ui/hud'
import type { Telemetry } from '../vehicle/driftCar'
import type { RoadNetwork } from '../world/roadNetwork'
import type { RoadRoute } from '../world/roadLayout'
import { DriftScore, type ScoreEvent } from './driftScore'
import { RouteRuns, type RunRouteId } from './routeRun'

/** Road route → themed run it belongs to (the cluster yard counts toward Systems Drop). */
const RUN_ROUTE: Partial<Record<RoadRoute, RunRouteId>> = {
  automation: 'automation',
  platform: 'platform',
  systems: 'systems',
  'systems-branch': 'systems',
}
/** Road route → banner name shown on entry. */
const BANNER: Partial<Record<RoadRoute, RouteId>> = {
  automation: 'automation',
  platform: 'platform',
  systems: 'systems',
  'systems-branch': 'systems-branch',
}
/** How far from a centreline the car may be and still count as "on" that road. */
const ROUTE_SNAP = 14

/** Optional observer for run lifecycle (the ghost lap uses it). */
export interface RunListener {
  start(route: RunRouteId): void
  finish(route: RunRouteId, time: number): void
  abandon(): void
}

export interface SessionInput {
  t: Telemetry
  /** frame time, seconds (the caller skips paused frames) */
  dt: number
  /** the chassis hit a guard rail hard this frame */
  railHit: boolean
  /** inside a shortcut zone where off-road driving is allowed (S2 riverbed, M7) */
  inShortcutZone: boolean
}

/**
 * One play session's rules (spec §8): Most Wanted drift scoring, the two crash
 * rules (hard rail hit, off-road > 1 s), route detection with banners, and
 * timed summit-to-town runs with a stored best per route.
 */
export class DriftSession {
  readonly score = new DriftScore()
  private currentRoute: RoadRoute | null = null
  private runRoute: RunRouteId | null = null
  private bankedAtRunStart = 0
  /**
   * Seconds of play: the sum of frame times clamped like the physics loop, so
   * run times match simulated time and a pause or a background tab never counts.
   */
  private clock = 0
  /** notified when runs start, finish or are abandoned */
  runListener: RunListener | null = null
  /** every score event (sound effects listen here) */
  scoreListener: ((e: ScoreEvent) => void) | null = null

  constructor(
    private readonly roads: RoadNetwork | null,
    private readonly hud: Hud,
    private readonly runs: RouteRuns,
  ) {}

  /** Route the car is on now (null on the flat pad or far off-road). */
  get route(): RoadRoute | null {
    return this.currentRoute
  }

  update(i: SessionInput): void {
    this.clock += Math.min(Math.max(Number.isFinite(i.dt) ? i.dt : 0, 0), MAX_FRAME)
    // airborne (a jump) is not off-road: the timer only runs with wheels on the ground
    const offRoadCrash = this.runs.offRoad(i.t.onRoad || i.t.wheelsOnGround === 0, i.dt, i.inShortcutZone)
    const events = this.score.step({ drifting: i.t.drifting, slipDeg: i.t.slipDeg, speed: i.t.speed, dt: i.dt, crashed: i.railHit || offRoadCrash })
    for (const e of events) {
      this.hud.event(e)
      this.scoreListener?.(e)
    }
    this.trackRoute(i.t, this.clock)
    this.hud.update(this.score.state(), i.t.speed)
  }

  /** Detect route changes: banners on entry, run start when leaving the summit, finish in town. */
  private trackRoute(t: Telemetry, now: number): void {
    if (!this.roads) return
    const hit = this.roads.index.nearest(t.pos.x, t.pos.z, ROUTE_SNAP)
    const route = hit?.edge.route ?? null
    if (!route || route === this.currentRoute) return
    const previous = this.currentRoute
    this.currentRoute = route

    const banner = BANNER[route]
    if (banner && BANNER[previous ?? 'summit'] !== banner) this.hud.routeBanner(routeNames[banner].toUpperCase())

    const runRoute = RUN_ROUTE[route]
    if (previous === 'summit' && runRoute) this.startRun(runRoute, now)
    // the run counts for the themed route the car is actually on (forks, shortcuts)
    else if (this.runRoute && runRoute) this.runRoute = runRoute
    if (route === 'town' && this.runRoute) this.finishRun(now)
    if ((route === 'summit' || route === 'return') && this.runRoute) {
      // went back up: abandon
      this.runRoute = null
      this.runListener?.abandon()
    }
  }

  private startRun(route: RunRouteId, now: number): void {
    this.runRoute = route
    this.bankedAtRunStart = this.score.state().banked
    this.runs.start(now)
    this.runListener?.start(route)
  }

  private finishRun(now: number): void {
    const s = this.score.state()
    // whatever is still unbanked at the finish line counts
    const points = Math.round(s.banked + s.running - this.bankedAtRunStart)
    const result = this.runs.finish(this.runRoute!, now, points)
    const name = routeNames[this.runRoute!]
    this.hud.hint(`${name}: ${formatTime(result.time)} · ${points.toLocaleString('en-US')} pts${result.newBest ? ' · new best' : ''}`)
    const route = this.runRoute!
    this.runRoute = null
    this.runListener?.finish(route, result.time)
  }
}

/** m:ss.t */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}
