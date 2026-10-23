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

export interface RouteRuns {
  /** Start (or restart) the clock; `now` in seconds. */
  start(now: number): void
  /** Whether a run is being timed. */
  active(): boolean
  /**
   * End the current run and store it if it beats the route best (higher score,
   * ties broken by lower time). Without an active run nothing is stored and
   * `{ time: 0, score, newBest: false }` is returned.
   */
  finish(route: RunRouteId, now: number, score: number): RunResult
  best(route: RunRouteId): RunRecord | null
  /**
   * Call once per frame. Returns true (= crash) while the car has been off the
   * road for more than OFF_ROAD_LIMIT seconds. Time inside the S2 riverbed
   * (`inShortcutZone`) never counts and resets the timer.
   */
  offRoad(onRoad: boolean, dt: number, inShortcutZone: boolean): boolean
}

export const OFF_ROAD_LIMIT = 1.0
const MAX_DT = 1 / 30
const keyFor = (route: RunRouteId) => `best:${route}`

function isRecord(v: unknown): v is RunRecord {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return typeof r.time === 'number' && Number.isFinite(r.time) && r.time >= 0 &&
    typeof r.score === 'number' && Number.isFinite(r.score) && r.score >= 0
}

const beats = (a: RunRecord, b: RunRecord) => a.score > b.score || (a.score === b.score && a.time < b.time)

export function createRouteRuns(storage: SafeStorage): RouteRuns {
  let startedAt: number | null = null
  let offFor = 0

  function best(route: RunRouteId): RunRecord | null {
    const v = storage.get<unknown>(keyFor(route), null)
    return isRecord(v) ? { time: v.time, score: v.score } : null
  }

  return {
    start(now) {
      startedAt = now
      offFor = 0
    },
    active: () => startedAt !== null,
    finish(route, now, score) {
      const safeScore = Number.isFinite(score) ? Math.max(0, score) : 0
      if (startedAt === null) return { time: 0, score: safeScore, newBest: false }
      const run: RunRecord = { time: Math.max(0, now - startedAt), score: safeScore }
      startedAt = null
      const prev = best(route)
      const newBest = prev === null || beats(run, prev)
      if (newBest) storage.set(keyFor(route), run)
      return { ...run, newBest }
    },
    best,
    offRoad(onRoad, dt, inShortcutZone) {
      if (onRoad || inShortcutZone) {
        offFor = 0
        return false
      }
      offFor += Math.min(Math.max(Number.isFinite(dt) ? dt : 0, 0), MAX_DT)
      return offFor > OFF_ROAD_LIMIT
    },
  }
}
