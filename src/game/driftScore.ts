/**
 * NFS Most Wanted–style drift scoring (plan Global Constraints, spec §8).
 * Pure state machine: feed it one frame at a time, it returns the events of that frame.
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

export interface DriftScore {
  step(i: ScoreInput): ScoreEvent[]
  state(): ScoreState
  reset(): void
}

export const MAX_DT = 1 / 30
export const CHAIN_WINDOW = 1.5
export const BANK_DELAY = 2.0
export const MAX_MULTIPLIER = 5
/** absorbs float drift from summing many small dt values */
const EPS = 1e-9

export function createDriftScore(): DriftScore {
  let running = 0
  let multiplier = 1
  let banked = 0
  let drifting = false
  /** seconds since the last drift ended; Infinity = no drift to chain from */
  let sinceEnd = Infinity

  function breakChain() {
    running = 0
    multiplier = 1
    sinceEnd = Infinity
  }

  function step(i: ScoreInput): ScoreEvent[] {
    const events: ScoreEvent[] = []
    const dt = Math.min(Math.max(Number.isFinite(i.dt) ? i.dt : 0, 0), MAX_DT)

    if (i.crashed) {
      if (running > 0) events.push({ type: 'crash', value: running })
      breakChain()
      drifting = false
      return events
    }

    if (i.drifting) {
      if (!drifting) {
        if (sinceEnd > CHAIN_WINDOW + EPS) {
          // too late to chain: the unbanked score stays, the multiplier restarts
          multiplier = 1
        } else if (multiplier < MAX_MULTIPLIER) {
          multiplier += 1
          events.push({ type: 'multiplier', value: multiplier })
        }
        events.push({ type: 'start', value: multiplier })
        drifting = true
      }
      const slip = Math.abs(i.slipDeg)
      const speed = Math.max(0, i.speed)
      if (Number.isFinite(slip) && Number.isFinite(speed)) running += slip * speed * dt * multiplier
      return events
    }

    if (drifting) {
      drifting = false
      sinceEnd = 0
    }
    sinceEnd += dt
    if (sinceEnd >= BANK_DELAY - EPS && (running > 0 || multiplier > 1)) {
      const amount = running
      banked += amount
      breakChain()
      if (amount > 0) events.push({ type: 'bank', value: amount })
    }
    return events
  }

  return {
    step,
    state: () => ({ running, multiplier, banked, drifting }),
    reset() {
      breakChain()
      banked = 0
      drifting = false
    },
  }
}
