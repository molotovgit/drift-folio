import { describe, expect, it } from 'vitest'
import { createFixedLoop } from '../../src/core/loop'

describe('fixed-step loop', () => {
  it('one 60 Hz frame is one tick', () => {
    let ticks = 0
    const loop = createFixedLoop(1 / 60, 1 / 30, () => ticks++)
    loop.advance(1 / 60)
    expect(ticks).toBe(1)
  })

  it('a 5 s frame (tab came back) runs at most two ticks', () => {
    let ticks = 0
    const loop = createFixedLoop(1 / 60, 1 / 30, () => ticks++)
    loop.advance(5)
    expect(ticks).toBe(2)
  })

  it('accumulates short frames and returns alpha in [0, 1)', () => {
    let ticks = 0
    const loop = createFixedLoop(1 / 60, 1 / 30, () => ticks++)
    const a1 = loop.advance(1 / 120)
    expect(ticks).toBe(0)
    expect(a1).toBeCloseTo(0.5, 5)
    const a2 = loop.advance(1 / 120)
    expect(ticks).toBe(1)
    expect(a2).toBeGreaterThanOrEqual(0)
    expect(a2).toBeLessThan(1)
  })

  it('ignores negative dt', () => {
    let ticks = 0
    const loop = createFixedLoop(1 / 60, 1 / 30, () => ticks++)
    loop.advance(-1)
    expect(ticks).toBe(0)
  })
})
