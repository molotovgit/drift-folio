import type { ScoreEvent, ScoreState } from '../game/driftScore'
import '../styles/hud.css'

export type HudScore = Pick<ScoreState, 'running' | 'multiplier' | 'banked' | 'drifting'>

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
export class Hud {
  private readonly wrap: HTMLElement
  private readonly score: HTMLElement
  private readonly mult: HTMLElement
  private readonly running: HTMLElement
  private readonly total: HTMLElement
  private readonly stamp: HTMLElement
  private readonly crash: HTMLElement
  private readonly banner: HTMLElement
  private readonly hintEl: HTMLElement
  private readonly speedNum: HTMLElement
  private readonly say: HTMLElement

  // last rendered values (NaN / null force the first paint)
  private shownRunning = NaN
  private shownMult = NaN
  private shownBanked = NaN
  private shownSpeed = NaN
  private shownDrifting: boolean | null = null
  private readonly timers = new Map<HTMLElement, number>()

  constructor(root: HTMLElement) {
    this.wrap = el('div', 'hud', root)
    const visual = el('div', 'hud__visual', this.wrap)
    visual.setAttribute('aria-hidden', 'true')

    this.score = el('div', 'hud__score', visual)
    this.mult = el('span', 'hud__mult', this.score)
    this.running = el('span', 'hud__running', this.score)
    this.total = el('div', 'hud__total', visual)
    this.stamp = el('div', 'hud__stamp', visual)
    this.crash = el('div', 'hud__crash', visual)
    this.crash.textContent = 'CRASH'
    this.banner = el('div', 'hud__banner', visual)
    this.hintEl = el('div', 'hud__hint', visual)
    const speedBox = el('div', 'hud__speed', visual)
    this.speedNum = el('span', 'hud__speed-num', speedBox)
    el('span', 'hud__speed-unit', speedBox).textContent = 'km/h'
    this.say = el('div', 'hud__sr', this.wrap)
  }

  /** Per frame. Touches the DOM only when a displayed value changes. `speed` in m/s. */
  update(s: HudScore, speed: number): void {
    const r = Math.floor(s.running)
    if (r !== this.shownRunning) {
      this.shownRunning = r
      this.running.textContent = fmt.format(r)
      this.score.classList.toggle('is-live', r > 0)
    }
    if (s.multiplier !== this.shownMult) {
      const up = s.multiplier > this.shownMult
      this.shownMult = s.multiplier
      this.mult.textContent = `×${s.multiplier}`
      this.mult.classList.toggle('is-live', s.multiplier > 1)
      if (up && s.multiplier > 1) this.flash(this.mult, 400)
    }
    const b = Math.floor(s.banked)
    if (b !== this.shownBanked) {
      this.shownBanked = b
      this.total.textContent = b > 0 ? `BANK ${fmt.format(b)}` : ''
    }
    if (s.drifting !== this.shownDrifting) {
      this.shownDrifting = s.drifting
      this.score.classList.toggle('is-drifting', s.drifting)
    }
    const kmh = Math.round(Math.max(0, Number.isFinite(speed) ? speed : 0) * 3.6)
    if (kmh !== this.shownSpeed) {
      this.shownSpeed = kmh
      this.speedNum.textContent = String(kmh)
    }
  }

  /** React to a DriftScore event: BANKED stamp or CRASH flash. */
  event(e: ScoreEvent): void {
    if (e.type === 'bank') {
      this.stamp.textContent = `BANKED +${fmt.format(Math.floor(e.value))}`
      this.flash(this.stamp, HUD_TIMING.stamp)
      this.announce(this.stamp.textContent)
    } else if (e.type === 'crash') {
      this.flash(this.crash, HUD_TIMING.crash)
      this.announce(`Crash, lost ${fmt.format(Math.floor(e.value))}`)
    }
  }

  /** Slide in the route name, e.g. "Systems Drop" → SYSTEMS DROP. */
  routeBanner(name: string): void {
    this.banner.textContent = name.toUpperCase()
    this.flash(this.banner, HUD_TIMING.banner)
    this.announce(name)
  }

  /** Small toast, e.g. "drift this corner". */
  hint(text: string): void {
    this.hintEl.textContent = text
    this.flash(this.hintEl, HUD_TIMING.hint)
    this.announce(text)
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
    this.wrap.remove()
  }

  /** Show `e` for `ms`, restarting its CSS animation if already showing. */
  private flash(e: HTMLElement, ms: number): void {
    const prev = this.timers.get(e)
    if (prev !== undefined) clearTimeout(prev)
    e.classList.remove('is-on')
    void e.offsetWidth // reflow so the keyframes start again
    e.classList.add('is-on')
    this.timers.set(e, window.setTimeout(() => {
      e.classList.remove('is-on')
      this.timers.delete(e)
    }, ms))
  }

  private announce(text: string): void {
    this.say.textContent = text
  }
}
