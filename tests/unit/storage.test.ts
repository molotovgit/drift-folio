import { describe, expect, it } from 'vitest'
import { createStorage } from '../../src/util/storage'

/** Minimal in-memory Storage; `failSet`/`failGet` simulate Safari private mode etc. */
function fakeStorage(opts: { failSet?: boolean; failGet?: boolean } = {}): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    get length() { return data.size },
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem(k: string) {
      if (opts.failGet) throw new Error('SecurityError')
      return data.get(k) ?? null
    },
    setItem(k: string, v: string) {
      if (opts.failSet) throw new Error('QuotaExceededError')
      data.set(k, v)
    },
    removeItem: (k: string) => { data.delete(k) },
  }
}

describe('storage', () => {
  it('round-trips JSON under the prefix', () => {
    const backend = fakeStorage()
    const s = createStorage('df:', backend)
    expect(s.set('best', { time: 61.5, score: 9000 })).toBe(true)
    expect(backend.data.get('df:best')).toBe('{"time":61.5,"score":9000}')
    expect(s.get('best', null)).toEqual({ time: 61.5, score: 9000 })
  })

  it('reads values written by an earlier session', () => {
    const backend = fakeStorage()
    backend.data.set('df:muted', 'true')
    expect(createStorage('df:', backend).get('muted', false)).toBe(true)
  })

  it('returns the fallback for a missing key', () => {
    expect(createStorage('df:', fakeStorage()).get('nope', 42)).toBe(42)
  })

  it('when setItem throws, set returns false and get returns the in-memory value', () => {
    const s = createStorage('df:', fakeStorage({ failSet: true }))
    expect(s.set('lanterns', [1, 2])).toBe(false)
    expect(s.get('lanterns', [])).toEqual([1, 2])
  })

  it('when getItem throws, get returns the fallback (then the in-memory value)', () => {
    const s = createStorage('df:', fakeStorage({ failGet: true }))
    expect(s.get('x', 'dflt')).toBe('dflt')
    s.set('x', 'live')
    expect(s.get('x', 'dflt')).toBe('live')
  })

  it('corrupted JSON returns the fallback', () => {
    const backend = fakeStorage()
    backend.data.set('df:best', '{not json')
    expect(createStorage('df:', backend).get('best', null)).toBeNull()
  })

  it('null backend works purely in memory', () => {
    const s = createStorage('df:', null)
    expect(s.set('a', 1)).toBe(false)
    expect(s.get('a', 0)).toBe(1)
  })

  it('unserialisable values are refused without throwing', () => {
    const s = createStorage('df:', fakeStorage())
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(s.set('c', cyclic)).toBe(false)
    expect(s.set('u', undefined)).toBe(false)
    expect(s.get('c', 'fallback')).toBe('fallback')
  })

  it('returned objects are copies (callers cannot mutate the cache)', () => {
    const s = createStorage('df:', null)
    s.set('o', { n: 1 })
    s.get<{ n: number }>('o', { n: 0 }).n = 99
    expect(s.get('o', { n: 0 })).toEqual({ n: 1 })
  })

  it('default backend is skipped safely when localStorage is unavailable (node)', () => {
    const s = createStorage('df:')
    s.set('k', 'v')
    expect(s.get('k', '')).toBe('v')
  })
})
