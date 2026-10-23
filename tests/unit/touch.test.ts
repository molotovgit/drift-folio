// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { TouchControls } from '../../src/ui/touch'

/** Dispatch a pointer event (happy-dom's PointerEvent carries pointerId / clientX). */
function ptr(el: Element, type: string, pointerId: number, clientX = 0) {
  el.dispatchEvent(new PointerEvent(type, { pointerId, clientX, bubbles: true, cancelable: true }))
}

describe('TouchControls (twin-axis touch)', () => {
  let touch: TouchControls
  const q = (sel: string) => document.querySelector(sel)!

  beforeEach(() => {
    document.body.innerHTML = ''
    // capture is a no-op here; the controls only need it not to throw
    HTMLElement.prototype.setPointerCapture = () => {}
    touch = new TouchControls(document.body)
  })

  it('the drift slider is an axis: drag right = drift right, back to 0 on release', () => {
    const slider = q('.touch__slider')
    ptr(slider, 'pointerdown', 1, 100)
    ptr(slider, 'pointermove', 1, 130)
    expect(touch.read()!.drift).toBeCloseTo(0.5)
    ptr(slider, 'pointerup', 1, 130)
    expect(touch.read()!.drift).toBe(0)
  })

  it('a second finger on the slider is ignored; a lost capture releases it', () => {
    const slider = q('.touch__slider')
    ptr(slider, 'pointerdown', 1, 100)
    ptr(slider, 'pointermove', 1, 160)
    ptr(slider, 'pointerdown', 2, 0)
    ptr(slider, 'pointermove', 2, -200)
    ptr(slider, 'pointerup', 2, -200)
    expect(touch.read()!.drift).toBe(1)
    ptr(slider, 'lostpointercapture', 1)
    expect(touch.read()!.drift).toBe(0)
  })

  it('buttons: only the pressing finger releases them, lost capture releases', () => {
    const gas = q('.touch__btn--gas')
    ptr(gas, 'pointerdown', 1)
    ptr(gas, 'pointerdown', 2)
    ptr(gas, 'pointerup', 2)
    expect(touch.read()!.throttle).toBe(1)
    ptr(gas, 'lostpointercapture', 1)
    expect(touch.read()!.throttle).toBe(0)
    const drift = q('.touch__btn--drift')
    ptr(drift, 'pointerdown', 3)
    expect(touch.read()!.handbrake).toBe(true)
    ptr(drift, 'pointerup', 3)
    expect(touch.read()!.handbrake).toBe(false)
  })
})
