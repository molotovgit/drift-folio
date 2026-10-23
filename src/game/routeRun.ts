import type { SafeStorage } from '../util/storage'

/** Routes that end in town and keep a best run ('systems-branch' rejoins 'systems'). */
export type RunRouteId = 'automation' | 'platform' | 'systems'

export interface RunRecord {
  /** seconds, summit pit box to town zone */
  time: number
  /** banked score for the run */
  score: number
}

export interface RunResult extends RunRecord {
  newBest: boolean
}

export const OFF_ROAD_LIMIT = 1.0
const MAX_DT = 1 / 30

/**
 * Summit-to-town run timing, per-route best (persisted through SafeStorage)
 * and the off-road crash rule.
 */
export class RouteRuns {
  private startedAt: number | null = null
  /** continuous seconds off the road */
  private offFor = 0

  constructor(private readonly storage: SafeStorage) {}

  /** Start (or restart) the clock; `now` in seconds. */
  start(now: number): void {
    this.startedAt = now
    this.offFor = 0
  }

  /** Whether a run is being timed. */
  active(): boolean {
    return this.startedAt !== null
  }

  /**
   * End the current run and store it if it beats the route best (higher score,
   * ties broken by lower time). Without an active run nothing is stored and
   * `{ time: 0, score, newBest: false }` is returned.
   */
  finish(route: RunRouteId, now: number, score: number): RunResult {
    const safeScore = Number.isFinite(score) ? Math.max(0, score) : 0
    if (this.startedAt === null) return { time: 0, score: safeScore, newBest: false }
    const run: RunRecord = { time: Math.max(0, now - this.startedAt), score: safeScore }
    this.startedAt = null
    const prev = this.best(route)
    const newBest = prev === null || RouteRuns.beats(run, prev)
    if (newBest) this.storage.set(RouteRuns.key(route), run)
    return { ...run, newBest }
  }

  best(route: RunRouteId): RunRecord | null {
    const v = this.storage.get<unknown>(RouteRuns.key(route), null)
    return RouteRuns.isRecord(v) ? { time: v.time, score: v.score } : null
  }

  /**
   * Call once per frame. Returns true (= crash) while the car has been off the
   * road for more than OFF_ROAD_LIMIT seconds. Time inside the S2 riverbed
   * (`inShortcutZone`) never counts and resets the timer.
   */
  offRoad(onRoad: boolean, dt: number, inShortcutZone: boolean): boolean {
    if (onRoad || inShortcutZone) {
      this.offFor = 0
      return false
    }
    this.offFor += Math.min(Math.max(Number.isFinite(dt) ? dt : 0, 0), MAX_DT)
    return this.offFor > OFF_ROAD_LIMIT
  }

  private static key(route: RunRouteId): string {
    return `best:${route}`
  }

  private static beats(a: RunRecord, b: RunRecord): boolean {
    return a.score > b.score || (a.score === b.score && a.time < b.time)
  }

  /** Stored data is untrusted (older versions, manual edits): validate its shape. */
  private static isRecord(v: unknown): v is RunRecord {
    if (typeof v !== 'object' || v === null) return false
    const r = v as Record<string, unknown>
    return typeof r.time === 'number' && Number.isFinite(r.time) && r.time >= 0 &&
      typeof r.score === 'number' && Number.isFinite(r.score) && r.score >= 0
  }
}
