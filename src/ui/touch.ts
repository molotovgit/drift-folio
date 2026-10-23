import type { AnalogSource, ControlState } from '../core/input'
import { clamp } from '../core/math'
import '../styles/touch.css'

/** Horizontal drag (px) for full steering lock on the left-hand pad. */
const STEER_RANGE_PX = 70
/** Horizontal drag (px) for a full drift angle on the right-hand drift slider. */
const DRIFT_RANGE_PX = 60

/**
 * A horizontal drag axis on one element: -1..1 from the drag distance since
 * the finger went down, back to 0 on release. Moves a knob for feedback.
 * `follow` places the knob under the finger on touch-down (floating stick).
 */
class DragAxis {
  value = 0
  private touch: { id: number; startX: number } | null = null

  constructor(
    el: HTMLElement,
    private readonly rangePx: number,
    private readonly follow: boolean,
  ) {
    const knob = el.querySelector<HTMLElement>('[data-knob]')!
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId)
      this.touch = { id: e.pointerId, startX: e.clientX }
      if (this.follow) {
        knob.style.left = `${e.offsetX}px`
        knob.style.top = `${e.offsetY}px`
      }
      el.classList.add('is-active')
    })
    el.addEventListener('pointermove', (e) => {
      if (this.touch?.id !== e.pointerId) return
      this.value = clamp((e.clientX - this.touch.startX) / this.rangePx, -1, 1)
      knob.style.transform = `translate(calc(-50% + ${this.value * this.rangePx}px), -50%)`
    })
    const end = (e: PointerEvent) => {
      if (this.touch?.id !== e.pointerId) return
      this.touch = null
      this.value = 0
      knob.style.transform = 'translate(-50%, -50%)'
      el.classList.remove('is-active')
    }
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
  }
}

/**
 * On-screen controls for phones (plan Task 9.1), twin-axis like the gamepad:
 * drag anywhere on the left half to steer the line; drag the DRIFT slider on
 * the right to swing the car out to a drift angle. GAS, BRAKE and the DRIFT
 * button (handbrake: drift toward the steer direction) sit under the slider.
 * Feeds the InputController as an AnalogSource. Shown only on touch screens.
 */
export class TouchControls implements AnalogSource {
  private readonly root: HTMLElement
  private readonly steer: DragAxis
  private readonly drift: DragAxis
  private readonly held = { throttle: false, brake: false, handbrake: false }
  private readonly openLink: HTMLAnchorElement

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div')
    this.root.className = 'touch'
    this.root.setAttribute('aria-hidden', 'true') // keyboard users don't need it; screen readers use the skip overlay
    this.root.innerHTML = `
      <div class="touch__pad"><span class="touch__knob" data-knob></span></div>
      <div class="touch__right">
        <div class="touch__slider"><span class="touch__slider-label">◀ DRIFT ▶</span><span class="touch__slider-knob" data-knob></span></div>
        <div class="touch__buttons">
          <button class="touch__btn touch__btn--drift" data-k="handbrake">DRIFT</button>
          <button class="touch__btn touch__btn--brake" data-k="brake">BRAKE</button>
          <button class="touch__btn touch__btn--gas" data-k="throttle">GAS</button>
        </div>
      </div>
      <a class="touch__open" target="_blank" rel="noopener" hidden></a>
      <p class="touch__rotate">Rotate your phone for the best view</p>`
    parent.append(this.root)
    this.openLink = this.root.querySelector<HTMLAnchorElement>('.touch__open')!
    this.steer = new DragAxis(this.root.querySelector<HTMLElement>('.touch__pad')!, STEER_RANGE_PX, true)
    this.drift = new DragAxis(this.root.querySelector<HTMLElement>('.touch__slider')!, DRIFT_RANGE_PX, false)
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('.touch__btn')) this.bindButton(b, b.dataset.k as keyof TouchControls['held'])
  }

  /** Touch screens only. */
  static wanted(): boolean {
    return matchMedia('(pointer: coarse)').matches
  }

  /**
   * Show the OPEN button for a town link pad (null hides it). A real link, so a
   * tap opens the page in a new tab without tripping popup blockers.
   */
  setLink(link: { label: string; url: string } | null): void {
    this.openLink.hidden = !link
    if (!link) return
    this.openLink.href = link.url
    this.openLink.textContent = `OPEN ${link.label} ↗`
  }

  read(): Partial<ControlState> | null {
    return {
      steer: this.steer.value,
      drift: this.drift.value,
      throttle: this.held.throttle ? 1 : 0,
      brake: this.held.brake ? 1 : 0,
      handbrake: this.held.handbrake,
    }
  }

  private bindButton(b: HTMLButtonElement, key: keyof TouchControls['held']): void {
    const set = (on: boolean) => (e: PointerEvent) => {
      e.preventDefault()
      this.held[key] = on
      b.classList.toggle('is-held', on)
    }
    b.addEventListener('pointerdown', (e) => {
      b.setPointerCapture(e.pointerId)
      set(true)(e)
    })
    b.addEventListener('pointerup', set(false))
    b.addEventListener('pointercancel', set(false))
    b.addEventListener('contextmenu', (e) => e.preventDefault())
  }
}
