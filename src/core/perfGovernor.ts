import type { QualityTier } from '../render/post'

/** Average frame time above this over the window means "too slow" (spec §9: 50 ms over 3 s). */
export const SLOW_FRAME_MS = 50
export const WINDOW_SECONDS = 3
/** wait this long after a change before judging again (shader compiles, model loads) */
const SETTLE_SECONDS = 4

export type GovernorAction = { type: 'tier'; tier: QualityTier } | { type: 'give-up' } | null

const DOWN: Record<QualityTier, QualityTier | null> = { high: 'mid', mid: 'low', low: null }

/**
 * Watches frame times and steps quality down when the device can't keep up:
 * high → mid → low; still slow on low → give up (show the text version).
 * Never steps back up within a session (avoids oscillating).
 */
export class PerfGovernor {
  private samples: number[] = []
  private sum = 0
  private settle = SETTLE_SECONDS
  private tier: QualityTier
  /** gave up already: the game has been handed to the text version */
  private done = false

  constructor(initial: QualityTier) {
    this.tier = initial
  }

  get current(): QualityTier {
    return this.tier
  }

  /** Feed one rendered frame's real (unclamped) duration in seconds. */
  frame(dt: number): GovernorAction {
    if (this.done) return null
    if (this.settle > 0) {
      this.settle -= dt
      return null
    }
    // a huge gap is a background tab, not a slow device
    if (dt > 1) return null
    this.samples.push(dt)
    this.sum += dt
    while (this.sum > WINDOW_SECONDS && this.samples.length > 1) this.sum -= this.samples.shift()!
    if (this.sum < WINDOW_SECONDS * 0.9) return null
    const avgMs = (this.sum / this.samples.length) * 1000
    if (avgMs <= SLOW_FRAME_MS) return null
    this.samples = []
    this.sum = 0
    this.settle = SETTLE_SECONDS
    const next = DOWN[this.tier]
    if (!next) {
      this.done = true
      return { type: 'give-up' }
    }
    this.tier = next
    return { type: 'tier', tier: next }
  }
}
