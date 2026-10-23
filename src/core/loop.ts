/** Physics runs at a fixed 60 Hz regardless of display refresh rate. */
export const PHYSICS_STEP = 1 / 60
/** Longest frame we simulate; a tab coming back after minutes runs at most 2 ticks (Review Focus #1). */
export const MAX_FRAME = 1 / 30

/**
 * Fixed-step accumulator. Rendering calls `advance` once per frame; the loop
 * runs as many fixed `step`-sized ticks as fit and returns the leftover as an
 * interpolation factor for smooth rendering between ticks.
 */
export class FixedStepLoop {
  private accumulator = 0
  private static readonly EPSILON = 1e-9

  constructor(
    private readonly step: number,
    private readonly maxFrame: number,
    private readonly tick: (h: number) => void,
  ) {}

  /** Advance by one rendered frame. Returns the interpolation alpha in [0, 1). */
  advance(frameDt: number): number {
    this.accumulator += Math.min(Math.max(frameDt, 0), this.maxFrame)
    while (this.accumulator + FixedStepLoop.EPSILON >= this.step) {
      this.tick(this.step)
      this.accumulator -= this.step
    }
    if (this.accumulator < 0) this.accumulator = 0
    return this.accumulator / this.step
  }
}
