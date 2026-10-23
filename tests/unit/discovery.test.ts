import { describe, expect, it } from 'vitest'
import { ShortcutDiscovery } from '../../src/game/discovery'
import { SafeStorage } from '../../src/util/storage'

describe('ShortcutDiscovery (plan Task 7.1)', () => {
  it('reports each shortcut as new exactly once', () => {
    const d = new ShortcutDiscovery(new SafeStorage('t', null))
    expect(d.discover('S1')).toBe(true)
    expect(d.discover('S1')).toBe(false)
    expect(d.count).toBe(1)
  })

  it('persists across sessions and lantern count equals discovered count', () => {
    const storage = new SafeStorage('t', null)
    const a = new ShortcutDiscovery(storage)
    a.discover('S2')
    a.discover('S5')
    const b = new ShortcutDiscovery(storage)
    expect(b.all()).toEqual(['S2', 'S5'])
    expect(b.count).toBe(2)
    expect(b.all().map(ShortcutDiscovery.lanternOf)).toEqual([1, 4])
  })

  it('ignores junk in storage', () => {
    const storage = new SafeStorage('t', null)
    storage.set('shortcuts', ['S9', 'S3', 42])
    expect(new ShortcutDiscovery(storage).all()).toEqual(['S3'])
  })
})
