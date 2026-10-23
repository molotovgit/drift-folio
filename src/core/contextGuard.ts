/** Injectable timers so the guard can be unit-tested with fake time. */
export interface Timers {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

/**
 * Gives a lost GPU context a grace window to come back before we give up
 * and show the text overlay (Review Focus #3: "does not restore in 3 s").
 */
export class ContextGuard {
  private handle: unknown = null
  private lostState = false

  constructor(
    private readonly onGiveUp: () => void,
    private readonly graceMs = 3000,
    private readonly timers: Timers = realTimers,
  ) {}

  get isLost(): boolean {
    return this.lostState
  }

  /** The context was lost: start the grace timer (repeat calls are ignored). */
  lost(): void {
    if (this.lostState) return
    this.lostState = true
    this.handle = this.timers.set(() => {
      this.handle = null
      if (this.lostState) this.onGiveUp()
    }, this.graceMs)
  }

  /** The context came back: cancel the pending give-up. */
  restored(): void {
    this.lostState = false
    if (this.handle !== null) this.timers.clear(this.handle)
    this.handle = null
  }
}
