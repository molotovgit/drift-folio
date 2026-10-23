// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHud, HUD_TIMING, type Hud } from '../../src/ui/hud'

const S = (running: number, multiplier = 1, banked = 0, drifting = false) => ({ running, multiplier, banked, drifting })

describe('hud', () => {
  let root: HTMLElement
  let hud: Hud
  const q = (sel: string) => root.querySelector<HTMLElement>(sel)!

  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="hud" aria-live="polite"></div>'
    root = document.getElementById('hud')!
    hud = createHud(root)
  })
  afterEach(() => {
    hud.dispose()
    vi.useRealTimers()
  })

  it('renders running score, multiplier, total and speed', () => {
    hud.update(S(12345.7, 3, 900, true), 20)
    expect(q('.hud__running').textContent).toBe('12,345')
    expect(q('.hud__score').classList.contains('is-live')).toBe(true)
    expect(q('.hud__score').classList.contains('is-drifting')).toBe(true)
    expect(q('.hud__mult').textContent).toBe('×3')
    expect(q('.hud__mult').classList.contains('is-live')).toBe(true)
    expect(q('.hud__total').textContent).toBe('BANK 900')
    expect(q('.hud__speed-num').textContent).toBe('72')
  })

  it('hides the counter and the ×1 badge when nothing is running', () => {
    hud.update(S(0), 0)
    expect(q('.hud__score').classList.contains('is-live')).toBe(false)
    expect(q('.hud__mult').classList.contains('is-live')).toBe(false)
    expect(q('.hud__total').textContent).toBe('')
  })

  it('touches the DOM only when a shown value changes', () => {
    hud.update(S(100.2, 2), 10)
    const obs = new MutationObserver(() => {})
    obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true })
    hud.update(S(100.9, 2), 10.1) // floor 100, 36 km/h → unchanged
    expect(obs.takeRecords()).toHaveLength(0)
    hud.update(S(101, 2), 10.1)
    expect(obs.takeRecords().length).toBeGreaterThan(0)
    obs.disconnect()
  })

  it('bank event shows a gold BANKED stamp that clears itself', () => {
    hud.event({ type: 'bank', value: 1800.4 })
    const stamp = q('.hud__stamp')
    expect(stamp.textContent).toBe('BANKED +1,800')
    expect(stamp.classList.contains('is-on')).toBe(true)
    expect(q('.hud__sr').textContent).toBe('BANKED +1,800')
    vi.advanceTimersByTime(HUD_TIMING.stamp + 1)
    expect(stamp.classList.contains('is-on')).toBe(false)
  })

  it('a second bank restarts the stamp timer', () => {
    hud.event({ type: 'bank', value: 1 })
    vi.advanceTimersByTime(HUD_TIMING.stamp - 100)
    hud.event({ type: 'bank', value: 2 })
    vi.advanceTimersByTime(200)
    expect(q('.hud__stamp').classList.contains('is-on')).toBe(true)
    expect(q('.hud__stamp').textContent).toBe('BANKED +2')
  })

  it('crash event flashes CRASH', () => {
    hud.event({ type: 'crash', value: 500 })
    expect(q('.hud__crash').classList.contains('is-on')).toBe(true)
    expect(q('.hud__crash').textContent).toBe('CRASH')
    vi.advanceTimersByTime(HUD_TIMING.crash + 1)
    expect(q('.hud__crash').classList.contains('is-on')).toBe(false)
  })

  it('route banner and hint toast', () => {
    hud.routeBanner('Systems Drop')
    expect(q('.hud__banner').textContent).toBe('SYSTEMS DROP')
    expect(q('.hud__banner').classList.contains('is-on')).toBe(true)
    hud.hint('drift this corner')
    expect(q('.hud__hint').textContent).toBe('drift this corner')
    expect(q('.hud__hint').classList.contains('is-on')).toBe(true)
    vi.advanceTimersByTime(Math.max(HUD_TIMING.banner, HUD_TIMING.hint) + 1)
    expect(q('.hud__banner').classList.contains('is-on')).toBe(false)
    expect(q('.hud__hint').classList.contains('is-on')).toBe(false)
  })

  it('visual layer is hidden from screen readers', () => {
    expect(q('.hud__visual').getAttribute('aria-hidden')).toBe('true')
    expect(q('.hud__sr').closest('[aria-hidden]')).toBeNull()
  })

  it('dispose removes the HUD and cancels timers', () => {
    hud.event({ type: 'bank', value: 5 })
    hud.dispose()
    expect(root.children).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
