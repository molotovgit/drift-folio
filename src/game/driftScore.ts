/**
 * NFS Most Wanted–style drift scoring (plan Global Constraints, spec §8).
 */
export type ScoreEventType = 'start' | 'multiplier' | 'bank' | 'crash'
export interface ScoreEvent {
  type: ScoreEventType
  /** start/multiplier: current multiplier · bank: amount banked · crash: amount lost */
  value: number
}

export interface ScoreInput {
  drifting: boolean
  /** body slip angle β, degrees (sign ignored) */
  slipDeg: number
  /** m/s */
  speed: number
  /** frame time, seconds (clamped to MAX_DT) */
  dt: number
  crashed: boolean
}

export interface ScoreState {
  running: number
  multiplier: number
  banked: number
  drifting: boolean
}

export const MAX_DT = 1 / 30
export const CHAIN_WINDOW = 1.5
export const BANK_DELAY = 2.0
export const MAX_MULTIPLIER = 5
/** absorbs float drift from summing many small dt values */
const EPS = 1e-9

/**
 * Pure state machine: feed it one frame at a time with `step`, it returns the
 * events of that frame. Per frame while drifting it adds
 * `|slipDeg| × speed × dt × multiplier` to the running (unbanked) score.
 */
export class DriftScore {
  private running = 0
  private multiplier = 1
  private banked = 0
  private drifting = false
  /** seconds since the last drift ended; Infinity = no drift to chain from */
  private sinceEnd = Infinity

  step(i: ScoreInput): ScoreEvent[] {
    const events: ScoreEvent[] = []
    const dt = Math.min(Math.max(Number.isFinite(i.dt) ? i.dt : 0, 0), MAX_DT)

    if (i.crashed) {
      if (this.running > 0) events.push({ type: 'crash', value: this.running })
      this.breakChain()
      this.drifting = false
      return events
    }

    if (i.drifting) {
      if (!this.drifting) this.startDrift(events)
      const slip = Math.abs(i.slipDeg)
      const speed = Math.max(0, i.speed)
      if (Number.isFinite(slip) && Number.isFinite(speed)) this.running += slip * speed * dt * this.multiplier
      return events
    }

    if (this.drifting) {
      this.drifting = false
      this.sinceEnd = 0
    }
    this.sinceEnd += dt
    if (this.sinceEnd >= BANK_DELAY - EPS && (this.running > 0 || this.multiplier > 1)) {
      const amount = this.running
      this.banked += amount
      this.breakChain()
      if (amount > 0) events.push({ type: 'bank', value: amount })
    }
    return events
  }

  state(): ScoreState {
    return { running: this.running, multiplier: this.multiplier, banked: this.banked, drifting: this.drifting }
  }

  reset(): void {
    this.breakChain()
    this.banked = 0
    this.drifting = false
  }

  /** A new drift begins: chain the multiplier if the last one ended recently enough. */
  private startDrift(events: ScoreEvent[]): void {
    if (this.sinceEnd > CHAIN_WINDOW + EPS) {
      // too late to chain: the unbanked score stays, the multiplier restarts
      this.multiplier = 1
    } else if (this.multiplier < MAX_MULTIPLIER) {
      this.multiplier += 1
      events.push({ type: 'multiplier', value: this.multiplier })
    }
    events.push({ type: 'start', value: this.multiplier })
    this.drifting = true
  }

  /** Drop the running score and the chain (after a bank or a crash). */
  private breakChain(): void {
    this.running = 0
    this.multiplier = 1
    this.sinceEnd = Infinity
  }
}
