import { describe, expect, it } from 'vitest'
import { createDriftScore, type DriftScore, type ScoreEvent } from '../../src/game/driftScore'

const DT = 1 / 30
const DRIFT = { drifting: true, slipDeg: 30, speed: 20, dt: DT, crashed: false }
const IDLE = { drifting: false, slipDeg: 0, speed: 20, dt: DT, crashed: false }

/** Step `seconds` worth of 1/30 s frames, collecting events. */
function run(s: DriftScore, seconds: number, input: typeof DRIFT): ScoreEvent[] {
  const out: ScoreEvent[] = []
  for (let i = 0; i < Math.round(seconds * 30); i++) out.push(...s.step(input))
  return out
}

describe('driftScore', () => {
  it('1 s drift at 30°, 20 m/s, ×1 scores 600', () => {
    const s = createDriftScore()
    const ev = run(s, 1, DRIFT)
    expect(s.state().running).toBeCloseTo(600, 6)
    expect(s.state().multiplier).toBe(1)
    expect(s.state().drifting).toBe(true)
    expect(ev).toEqual([{ type: 'start', value: 1 }])
  })

  it('uses |slip| (left and right slides score the same)', () => {
    const s = createDriftScore()
    run(s, 1, { ...DRIFT, slipDeg: -30 })
    expect(s.state().running).toBeCloseTo(600, 6)
  })

  it('new drift 1.0 s after the previous one ends → ×2', () => {
    const s = createDriftScore()
    run(s, 1, DRIFT)
    run(s, 1.0, IDLE)
    const ev = s.step(DRIFT)
    expect(ev).toEqual([{ type: 'multiplier', value: 2 }, { type: 'start', value: 2 }])
    expect(s.state().multiplier).toBe(2)
    run(s, 1 - DT, DRIFT)
    expect(s.state().running).toBeCloseTo(600 + 1200, 6)
  })

  it('new drift exactly 1.5 s after the end still chains', () => {
    const s = createDriftScore()
    run(s, 1, DRIFT)
    run(s, 1.5, IDLE)
    s.step(DRIFT)
    expect(s.state().multiplier).toBe(2)
  })

  it('new drift 1.6 s after the end → stays ×1, unbanked score kept', () => {
    const s = createDriftScore()
    run(s, 1, DRIFT)
    run(s, 1.6, IDLE)
    const ev = s.step(DRIFT)
    expect(ev).toEqual([{ type: 'start', value: 1 }])
    expect(s.state().multiplier).toBe(1)
    expect(s.state().running).toBeGreaterThan(600)
    expect(s.state().banked).toBe(0)
  })

  it('a late drift resets a chained multiplier to ×1', () => {
    const s = createDriftScore()
    run(s, 0.5, DRIFT)
    run(s, 1, IDLE)
    run(s, 0.5, DRIFT)
    expect(s.state().multiplier).toBe(2)
    run(s, 1.7, IDLE)
    s.step(DRIFT)
    expect(s.state().multiplier).toBe(1)
  })

  it('six chained drifts → multiplier capped at ×5', () => {
    const s = createDriftScore()
    const mults: number[] = []
    for (let i = 0; i < 6; i++) {
      run(s, 0.5, DRIFT)
      mults.push(s.state().multiplier)
      run(s, 1.0, IDLE)
    }
    expect(mults).toEqual([1, 2, 3, 4, 5, 5])
  })

  it('2.0 s without drift banks running, resets multiplier', () => {
    const s = createDriftScore()
    run(s, 1, DRIFT)
    run(s, 1, IDLE)
    run(s, 1, DRIFT) // ×2 → running 600 + 1200
    const ev = run(s, 2.0, IDLE)
    expect(ev).toHaveLength(1)
    expect(ev[0].type).toBe('bank')
    expect(ev[0].value).toBeCloseTo(1800, 6)
    expect(s.state()).toMatchObject({ running: 0, multiplier: 1, drifting: false })
    expect(s.state().banked).toBeCloseTo(1800, 6)
  })

  it('does not bank before 2.0 s, and banks only once', () => {
    const s = createDriftScore()
    run(s, 1, DRIFT)
    expect(run(s, 1.9, IDLE)).toEqual([])
    expect(s.state().banked).toBe(0)
    expect(run(s, 0.1, IDLE).map((e) => e.type)).toEqual(['bank'])
    expect(run(s, 5, IDLE)).toEqual([])
  })

  it('a drift after a bank starts a fresh chain at ×1', () => {
    const s = createDriftScore()
    run(s, 1, DRIFT)
    run(s, 2, IDLE)
    s.step(DRIFT)
    expect(s.state().multiplier).toBe(1)
  })

  it('crash while running discards running, resets multiplier, keeps banked', () => {
    const s = createDriftScore()
    run(s, 1, DRIFT)
    run(s, 2, IDLE) // banked 600
    run(s, 0.5, DRIFT)
    run(s, 1, IDLE)
    run(s, 0.5, DRIFT) // ×2
    const before = s.state().running
    const ev = s.step({ ...DRIFT, crashed: true })
    expect(ev).toHaveLength(1)
    expect(ev[0]).toEqual({ type: 'crash', value: before })
    expect(s.state()).toMatchObject({ running: 0, multiplier: 1, drifting: false })
    expect(s.state().banked).toBeCloseTo(600, 6)
  })

  it('crash with nothing running emits no event', () => {
    const s = createDriftScore()
    expect(s.step({ ...IDLE, crashed: true })).toEqual([])
  })

  it('drift after a crash does not chain', () => {
    const s = createDriftScore()
    run(s, 0.5, DRIFT)
    s.step({ ...IDLE, crashed: true })
    s.step(DRIFT)
    expect(s.state().multiplier).toBe(1)
  })

  it('dt of 5 s is clamped to 1/30 before scoring', () => {
    const s = createDriftScore()
    s.step({ ...DRIFT, dt: 5 })
    expect(s.state().running).toBeCloseTo(30 * 20 * DT, 9)
  })

  it('a 5 s idle frame does not bank on its own', () => {
    const s = createDriftScore()
    run(s, 1, DRIFT)
    expect(s.step({ ...IDLE, dt: 5 })).toEqual([])
  })

  it('ignores negative and non-finite dt', () => {
    const s = createDriftScore()
    s.step({ ...DRIFT, dt: -1 })
    s.step({ ...DRIFT, dt: Number.NaN })
    expect(s.state().running).toBe(0)
  })

  it('reset clears everything', () => {
    const s = createDriftScore()
    run(s, 1, DRIFT)
    run(s, 2, IDLE)
    run(s, 1, DRIFT)
    s.reset()
    expect(s.state()).toEqual({ running: 0, multiplier: 1, banked: 0, drifting: false })
  })
})
