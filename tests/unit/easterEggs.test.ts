import { describe, expect, it, vi } from 'vitest'
import { KeySequence, KONAMI } from '../../src/game/easterEggs'

describe('KeySequence (Konami code)', () => {
  it('fires once the full sequence is typed', () => {
    const hit = vi.fn()
    const k = new KeySequence(hit)
    KONAMI.slice(0, -1).forEach((c) => expect(k.push(c)).toBe(false))
    expect(k.push('KeyA')).toBe(true)
    expect(hit).toHaveBeenCalledTimes(1)
  })

  it('a wrong key restarts the match', () => {
    const hit = vi.fn()
    const k = new KeySequence(hit)
    for (const c of ['ArrowUp', 'ArrowUp', 'KeyW', ...KONAMI.slice(2)]) k.push(c)
    expect(hit).not.toHaveBeenCalled()
  })

  it('tolerates an extra ↑ at the start (↑ ↑ ↑ ↓ ↓ …)', () => {
    const hit = vi.fn()
    const k = new KeySequence(hit)
    for (const c of ['ArrowUp', ...KONAMI]) k.push(c)
    expect(hit).toHaveBeenCalledTimes(1)
  })
})
