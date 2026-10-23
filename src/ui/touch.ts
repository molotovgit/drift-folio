import type { AnalogSource, ControlState } from '../core/input'
import { clamp } from '../core/math'
import '../styles/touch.css'

/** Horizontal drag (px) for full steering lock on the left-hand pad. */
const STEER_RANGE_PX = 70

/**
 * On-screen controls for phones (plan Task 9.1): drag anywhere on the left
 * half to steer; GAS, BRAKE and DRIFT (handbrake) buttons on the right.
 * Feeds the InputController as an AnalogSource. Shown only on touch screens.
 */
export class TouchControls implements AnalogSource {
  private readonly root: HTMLElement
  private steerTouch: { id: number; startX: number } | null = null
  private steer = 0
  private readonly held = { throttle: false, brake: false, handbrake: false }

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div')
    this.root.className = 'touch'
    this.root.setAttribute('aria-hidden', 'true') // keyboard users don't need it; screen readers use the skip overlay
    this.root.innerHTML = `
      <div class="touch__pad"><span class="touch__knob"></span></div>
      <div class="touch__buttons">
        <button class="touch__btn touch__btn--drift" data-k="handbrake">DRIFT</button>
        <button class="touch__btn touch__btn--brake" data-k="brake">BRAKE</button>
        <button class="touch__btn touch__btn--gas" data-k="throttle">GAS</button>
      </div>
      <p class="touch__rotate">Rotate your phone for the best view</p>`
    parent.append(this.root)
    this.bindPad(this.root.querySelector<HTMLElement>('.touch__pad')!)
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('.touch__btn')) this.bindButton(b, b.dataset.k as keyof TouchControls['held'])
  }

  /** Touch screens only. */
  static wanted(): boolean {
    return matchMedia('(pointer: coarse)').matches
  }

  read(): Partial<ControlState> | null {
    return {
      steer: this.steer,
      throttle: this.held.throttle ? 1 : 0,
      brake: this.held.brake ? 1 : 0,
      handbrake: this.held.handbrake,
    }
  }

  private bindPad(pad: HTMLElement): void {
    const knob = pad.querySelector<HTMLElement>('.touch__knob')!
    pad.addEventListener('pointerdown', (e) => {
      pad.setPointerCapture(e.pointerId)
      this.steerTouch = { id: e.pointerId, startX: e.clientX }
      knob.style.left = `${e.offsetX}px`
      knob.style.top = `${e.offsetY}px`
      pad.classList.add('is-active')
    })
    pad.addEventListener('pointermove', (e) => {
      if (this.steerTouch?.id !== e.pointerId) return
      this.steer = clamp((e.clientX - this.steerTouch.startX) / STEER_RANGE_PX, -1, 1)
      knob.style.transform = `translate(calc(-50% + ${this.steer * STEER_RANGE_PX}px), -50%)`
    })
    const end = (e: PointerEvent) => {
      if (this.steerTouch?.id !== e.pointerId) return
      this.steerTouch = null
      this.steer = 0
      knob.style.transform = 'translate(-50%, -50%)'
      pad.classList.remove('is-active')
    }
    pad.addEventListener('pointerup', end)
    pad.addEventListener('pointercancel', end)
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
