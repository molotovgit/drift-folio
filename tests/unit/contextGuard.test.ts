import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextGuard } from '../../src/core/contextGuard'

describe('context loss guard', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('gives up after 3 s when the context does not come back', () => {
    const giveUp = vi.fn()
    const g = new ContextGuard(giveUp)
    g.lost()
    vi.advanceTimersByTime(2999)
    expect(giveUp).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(giveUp).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the context is restored inside the window', () => {
    const giveUp = vi.fn()
    const g = new ContextGuard(giveUp)
    g.lost()
    vi.advanceTimersByTime(1500)
    g.restored()
    vi.advanceTimersByTime(5000)
    expect(giveUp).not.toHaveBeenCalled()
    expect(g.isLost).toBe(false)
  })

  it('a second loss event while already lost does not restart or double-fire', () => {
    const giveUp = vi.fn()
    const g = new ContextGuard(giveUp)
    g.lost()
    vi.advanceTimersByTime(2000)
    g.lost()
    vi.advanceTimersByTime(1000)
    expect(giveUp).toHaveBeenCalledTimes(1)
  })
})
