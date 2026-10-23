import type { SafeStorage } from '../util/storage'

/** Seconds added for every cone knocked over (plan Task 6.2). */
export const CONE_PENALTY = 2

export type GymkhanaEvent =
  | { type: 'start' }
  | { type: 'cone'; penalty: number }
  | { type: 'finish'; time: number; best: boolean }
  | { type: 'abort' }

/**
 * Timed cone course in the town lot: drive through the start gate, around the
 * cones, through the finish gate. Each displaced cone adds CONE_PENALTY. The
 * best time is stored. Leaving the lot mid-run aborts it.
 */
export class GymkhanaTimer {
  private runningSince: number | null = null
  private penalties = 0
  private bestTime: number | null

  constructor(private readonly storage: SafeStorage) {
    this.bestTime = storage.get<number | null>('gymkhana-best', null)
  }

  get running(): boolean {
    return this.runningSince !== null
  }

  get best(): number | null {
    return this.bestTime
  }

  /** Elapsed time including penalties (0 when not running). */
  elapsed(now: number): number {
    return this.runningSince === null ? 0 : now - this.runningSince + this.penalties * CONE_PENALTY
  }

  startGate(now: number): GymkhanaEvent | null {
    if (this.running) return null
    this.runningSince = now
    this.penalties = 0
    return { type: 'start' }
  }

  coneHit(): GymkhanaEvent | null {
    if (!this.running) return null
    this.penalties++
    return { type: 'cone', penalty: CONE_PENALTY }
  }

  finishGate(now: number): GymkhanaEvent | null {
    if (!this.running) return null
    const time = this.elapsed(now)
    this.runningSince = null
    const best = this.bestTime === null || time < this.bestTime
    if (best) {
      this.bestTime = time
      this.storage.set('gymkhana-best', time)
    }
    return { type: 'finish', time, best }
  }

  abort(): GymkhanaEvent | null {
    if (!this.running) return null
    this.runningSince = null
    return { type: 'abort' }
  }
}
