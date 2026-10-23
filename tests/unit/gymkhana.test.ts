import { describe, expect, it } from 'vitest'
import { CONE_PENALTY, GymkhanaTimer } from '../../src/game/gymkhana'
import { SafeStorage } from '../../src/util/storage'

const fresh = () => new GymkhanaTimer(new SafeStorage('test', null))

describe('GymkhanaTimer (plan Task 6.2)', () => {
  it('times start gate → finish gate', () => {
    const g = fresh()
    expect(g.startGate(10)?.type).toBe('start')
    expect(g.finishGate(31.5)).toEqual({ type: 'finish', time: 21.5, best: true })
    expect(g.best).toBe(21.5)
  })

  it('adds +2 s per cone hit', () => {
    const g = fresh()
    g.startGate(0)
    g.coneHit()
    g.coneHit()
    expect(CONE_PENALTY).toBe(2)
    expect(g.finishGate(20)?.type === 'finish' && (g.best ?? 0)).toBe(24)
  })

  it('only beats the best with a faster run', () => {
    const g = fresh()
    g.startGate(0)
    g.finishGate(20)
    g.startGate(100)
    expect(g.finishGate(125)).toEqual({ type: 'finish', time: 25, best: false })
    expect(g.best).toBe(20)
  })

  it('ignores cones and the finish gate when no run is active; abort cancels', () => {
    const g = fresh()
    expect(g.coneHit()).toBeNull()
    expect(g.finishGate(5)).toBeNull()
    g.startGate(0)
    expect(g.abort()?.type).toBe('abort')
    expect(g.running).toBe(false)
  })

  it('remembers the best time across sessions', () => {
    const storage = new SafeStorage('test', null)
    const a = new GymkhanaTimer(storage)
    a.startGate(0)
    a.finishGate(18)
    expect(new GymkhanaTimer(storage).best).toBe(18)
  })
})
