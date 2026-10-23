import { describe, expect, it } from 'vitest'
import { PerfGovernor } from '../../src/core/perfGovernor'

/** Run `seconds` of frames at `ms` each; return the actions taken. */
function run(g: PerfGovernor, seconds: number, ms: number) {
  const actions = []
  for (let t = 0; t < seconds; t += ms / 1000) {
    const a = g.frame(ms / 1000)
    if (a) actions.push(a)
  }
  return actions
}

describe('PerfGovernor (plan Task 9.3)', () => {
  it('leaves a fast device alone', () => {
    expect(run(new PerfGovernor('high'), 20, 16)).toEqual([])
  })

  it('steps high → mid → low, then gives up when still too slow', () => {
    const g = new PerfGovernor('high')
    const actions = run(g, 40, 80)
    expect(actions).toEqual([{ type: 'tier', tier: 'mid' }, { type: 'tier', tier: 'low' }, { type: 'give-up' }])
  })

  it('waits for the first seconds to settle (loading hitches do not count)', () => {
    const g = new PerfGovernor('high')
    expect(run(g, 3.5, 200)).toEqual([])
  })

  it('ignores a single background-tab gap', () => {
    const g = new PerfGovernor('high')
    run(g, 5, 16)
    expect(g.frame(30)).toBeNull()
    expect(run(g, 5, 16)).toEqual([])
  })

  it('recovers nothing: once stepped down it stays down', () => {
    const g = new PerfGovernor('high')
    run(g, 12, 80)
    run(g, 30, 10)
    expect(g.current).not.toBe('high')
  })
})
