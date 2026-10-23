import type { ScoreEvent, ScoreState } from '../game/driftScore'
import '../styles/hud.css'

export type HudScore = Pick<ScoreState, 'running' | 'multiplier' | 'banked' | 'drifting'>

export interface Hud {
  /** Per frame. Touches the DOM only when a displayed value changes. `speed` in m/s. */
  update(state: HudScore, speed: number): void
  event(e: ScoreEvent): void
  routeBanner(name: string): void
  hint(text: string): void
  dispose(): void
}

/** How long each transient element stays up, ms. */
export const HUD_TIMING = { stamp: 1500, crash: 900, banner: 2600, hint: 2400 } as const

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function el(tag: 'div' | 'span', cls: string, parent: HTMLElement): HTMLElement {
  const e = document.createElement(tag)
  e.className = cls
  parent.append(e)
  return e
}

/**
 * NFS Most Wanted–style drift HUD. Visual elements are aria-hidden (the score
 * changes every frame); bank, crash, banner and hint are announced once through
 * a visually hidden line inside the live #hud region.
 */
export function createHud(root: HTMLElement): Hud {
  const wrap = el('div', 'hud', root)
  const visual = el('div', 'hud__visual', wrap)
  visual.setAttribute('aria-hidden', 'true')

  const score = el('div', 'hud__score', visual)
  const mult = el('span', 'hud__mult', score)
  const running = el('span', 'hud__running', score)
  const total = el('div', 'hud__total', visual)
  const stamp = el('div', 'hud__stamp', visual)
  const crash = el('div', 'hud__crash', visual)
  crash.textContent = 'CRASH'
  const banner = el('div', 'hud__banner', visual)
  const hintEl = el('div', 'hud__hint', visual)
  const speedBox = el('div', 'hud__speed', visual)
  const speedNum = el('span', 'hud__speed-num', speedBox)
  el('span', 'hud__speed-unit', speedBox).textContent = 'km/h'
  const say = el('div', 'hud__sr', wrap)

  // last rendered values (NaN forces the first paint)
  let shownRunning = NaN
  let shownMult = NaN
  let shownBanked = NaN
  let shownSpeed = NaN
  let shownDrifting: boolean | null = null
  const timers = new Map<HTMLElement, number>()

  /** Show `e` for `ms`, restarting its CSS animation if already showing. */
  function flash(e: HTMLElement, ms: number) {
    const prev = timers.get(e)
    if (prev !== undefined) clearTimeout(prev)
    e.classList.remove('is-on')
    void e.offsetWidth // reflow so the keyframes start again
    e.classList.add('is-on')
    timers.set(e, window.setTimeout(() => {
      e.classList.remove('is-on')
      timers.delete(e)
    }, ms))
  }

  function announce(text: string) {
    say.textContent = text
  }

  return {
    update(s, speed) {
      const r = Math.floor(s.running)
      if (r !== shownRunning) {
        shownRunning = r
        running.textContent = fmt.format(r)
        score.classList.toggle('is-live', r > 0)
      }
      if (s.multiplier !== shownMult) {
        const up = s.multiplier > shownMult
        shownMult = s.multiplier
        mult.textContent = `×${s.multiplier}`
        mult.classList.toggle('is-live', s.multiplier > 1)
        if (up && s.multiplier > 1) flash(mult, 400)
      }
      const b = Math.floor(s.banked)
      if (b !== shownBanked) {
        shownBanked = b
        total.textContent = b > 0 ? `BANK ${fmt.format(b)}` : ''
      }
      if (s.drifting !== shownDrifting) {
        shownDrifting = s.drifting
        score.classList.toggle('is-drifting', s.drifting)
      }
      const kmh = Math.round(Math.max(0, Number.isFinite(speed) ? speed : 0) * 3.6)
      if (kmh !== shownSpeed) {
        shownSpeed = kmh
        speedNum.textContent = String(kmh)
      }
    },
    event(e) {
      if (e.type === 'bank') {
        stamp.textContent = `BANKED +${fmt.format(Math.floor(e.value))}`
        flash(stamp, HUD_TIMING.stamp)
        announce(stamp.textContent)
      } else if (e.type === 'crash') {
        flash(crash, HUD_TIMING.crash)
        announce(`Crash, lost ${fmt.format(Math.floor(e.value))}`)
      }
    },
    routeBanner(name) {
      banner.textContent = name.toUpperCase()
      flash(banner, HUD_TIMING.banner)
      announce(name)
    },
    hint(text) {
      hintEl.textContent = text
      flash(hintEl, HUD_TIMING.hint)
      announce(text)
    },
    dispose() {
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
      wrap.remove()
    },
  }
}
