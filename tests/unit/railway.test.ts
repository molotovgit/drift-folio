import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', () => import('three'))
const { secondsUntilTrainAt, TRAIN_PERIOD, TRAIN_RUN, trainHeadX } = await import('../../src/world/railway')
const { RAIL_X } = await import('../../src/world/shortcutLayout')

describe('train timetable (plan Task 7.6)', () => {
  it('runs for TRAIN_RUN seconds every TRAIN_PERIOD, west to east', () => {
    expect(TRAIN_PERIOD).toBe(45)
    expect(trainHeadX(0)).toBeLessThan(RAIL_X.from)
    expect(trainHeadX(TRAIN_RUN)).toBeGreaterThan(RAIL_X.to)
    expect(trainHeadX(TRAIN_RUN + 1)).toBeNull()
    expect(trainHeadX(TRAIN_PERIOD + 1)!).toBeLessThan(trainHeadX(TRAIN_PERIOD + 5)!)
  })

  it('predicts when it reaches a crossing, wrapping to the next cycle', () => {
    const x = 0
    const t = 3
    const wait = secondsUntilTrainAt(x, t)
    expect(Math.abs(trainHeadX(t + wait)! - x)).toBeLessThan(1)
    const later = secondsUntilTrainAt(x, t + wait + 1)
    expect(later).toBeGreaterThan(TRAIN_PERIOD - 2)
  })
})
