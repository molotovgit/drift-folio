/**
 * Fixed-step accumulator. The frame dt is clamped to maxFrame first, so a tab
 * that comes back after minutes runs at most maxFrame/step ticks (Review Focus #1).
 */
export function createFixedLoop(step: number, maxFrame: number, tick: (h: number) => void) {
  let acc = 0
  const eps = 1e-9
  return {
    /** Advances by one rendered frame; returns interpolation alpha in [0, 1). */
    advance(frameDt: number): number {
      const dt = Math.min(Math.max(frameDt, 0), maxFrame)
      acc += dt
      while (acc + eps >= step) {
        tick(step)
        acc -= step
      }
      if (acc < 0) acc = 0
      return acc / step
    },
  }
}

export const PHYSICS_STEP = 1 / 60
export const MAX_FRAME = 1 / 30
