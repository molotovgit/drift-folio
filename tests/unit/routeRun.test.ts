import { describe, expect, it } from 'vitest'
import { createRouteRuns } from '../../src/game/routeRun'
import { createStorage } from '../../src/util/storage'

function memBackend(failSet = false): Storage {
  const data = new Map<string, string>()
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failSet) throw new Error('QuotaExceededError')
      data.set(k, v)
    },
    removeItem: (k: string) => { data.delete(k) },
  }
}

describe('routeRun', () => {
  it('times a run and stores the first result as best', () => {
    const runs = createRouteRuns(createStorage('df:', memBackend()))
    expect(runs.best('systems')).toBeNull()
    runs.start(10)
    expect(runs.active()).toBe(true)
    expect(runs.finish('systems', 75.5, 12000)).toEqual({ time: 65.5, score: 12000, newBest: true })
    expect(runs.active()).toBe(false)
    expect(runs.best('systems')).toEqual({ time: 65.5, score: 12000 })
  })

  it('keeps bests per route', () => {
    const runs = createRouteRuns(createStorage('df:', memBackend()))
    runs.start(0)
    runs.finish('platform', 50, 100)
    expect(runs.best('platform')).toEqual({ time: 50, score: 100 })
    expect(runs.best('automation')).toBeNull()
  })

  it('higher score wins; equal score falls back to lower time', () => {
    const runs = createRouteRuns(createStorage('df:', memBackend()))
    runs.start(0); runs.finish('systems', 60, 5000)
    runs.start(0); expect(runs.finish('systems', 50, 4000).newBest).toBe(false)
    runs.start(0); expect(runs.finish('systems', 70, 5000).newBest).toBe(false)
    runs.start(0); expect(runs.finish('systems', 55, 5000).newBest).toBe(true)
    runs.start(0); expect(runs.finish('systems', 90, 9000).newBest).toBe(true)
    expect(runs.best('systems')).toEqual({ time: 90, score: 9000 })
  })

  it('bests persist across sessions through storage', () => {
    const backend = memBackend()
    const a = createRouteRuns(createStorage('df:', backend))
    a.start(0); a.finish('automation', 40, 300)
    const b = createRouteRuns(createStorage('df:', backend))
    expect(b.best('automation')).toEqual({ time: 40, score: 300 })
  })

  it('storage blocked: bests still work in memory for the session', () => {
    const runs = createRouteRuns(createStorage('df:', memBackend(true)))
    runs.start(0)
    expect(runs.finish('systems', 30, 800).newBest).toBe(true)
    expect(runs.best('systems')).toEqual({ time: 30, score: 800 })
    runs.start(0)
    expect(runs.finish('systems', 30, 700).newBest).toBe(false)
  })

  it('ignores a malformed stored best', () => {
    const backend = memBackend()
    backend.setItem('df:best:systems', '{"time":"fast","score":1}')
    const runs = createRouteRuns(createStorage('df:', backend))
    expect(runs.best('systems')).toBeNull()
    runs.start(0)
    expect(runs.finish('systems', 10, 1).newBest).toBe(true)
  })

  it('finish without start stores nothing', () => {
    const runs = createRouteRuns(createStorage('df:', memBackend()))
    expect(runs.finish('systems', 99, 500)).toEqual({ time: 0, score: 500, newBest: false })
    expect(runs.best('systems')).toBeNull()
  })

  describe('offRoad', () => {
    const DT = 1 / 30
    const frames = (n: number, f: () => boolean) => Array.from({ length: n }, f)

    it('crashes only after more than 1.0 s off road', () => {
      const runs = createRouteRuns(createStorage('df:', null))
      const res = frames(30, () => runs.offRoad(false, DT, false))
      expect(res.every((r) => !r)).toBe(true)
      expect(runs.offRoad(false, DT, false)).toBe(true)
    })

    it('touching the road resets the timer', () => {
      const runs = createRouteRuns(createStorage('df:', null))
      frames(25, () => runs.offRoad(false, DT, false))
      runs.offRoad(true, DT, false)
      expect(frames(30, () => runs.offRoad(false, DT, false)).some(Boolean)).toBe(false)
    })

    it('never crashes inside the S2 riverbed zone', () => {
      const runs = createRouteRuns(createStorage('df:', null))
      expect(frames(300, () => runs.offRoad(false, DT, true)).some(Boolean)).toBe(false)
    })

    it('clamps a long frame so a tab switch does not cause a crash', () => {
      const runs = createRouteRuns(createStorage('df:', null))
      expect(runs.offRoad(false, 5, false)).toBe(false)
    })
  })
})
