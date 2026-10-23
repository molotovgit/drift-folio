import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyDeadzone, GamepadSource, STICK_DEADZONE } from '../../src/core/gamepad'
import { InputController } from '../../src/core/input'

/** A standard-mapping pad: 4 axes, 17 buttons, all at rest unless overridden. */
function pad(axes: Partial<Record<number, number>> = {}, buttons: Partial<Record<number, number>> = {}): Gamepad {
  return {
    id: 'test pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [0, 1, 2, 3].map((i) => axes[i] ?? 0),
    buttons: Array.from({ length: 17 }, (_, i) => {
      const value = buttons[i] ?? 0
      return { value, pressed: value > 0.5, touched: value > 0 }
    }),
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad
}

describe('applyDeadzone', () => {
  it('zeroes the deadzone and rescales the rest to reach ±1', () => {
    expect(applyDeadzone(0.1, 0.15)).toBe(0)
    expect(applyDeadzone(-0.15, 0.15)).toBe(0)
    expect(applyDeadzone(1, 0.15)).toBe(1)
    expect(applyDeadzone(-1, 0.15)).toBe(-1)
    expect(applyDeadzone(0.575, 0.15)).toBeCloseTo(0.5)
  })
})

describe('GamepadSource (twin stick)', () => {
  it('left stick X steers, right stick X drifts, triggers are analog pedals', () => {
    const src = new GamepadSource(() => [pad({ 0: -1, 2: 0.575 }, { 7: 0.8, 6: 0.3 })])
    const s = src.read()!
    expect(s.steer).toBe(-1)
    expect(s.drift).toBeCloseTo(0.5)
    expect(s.throttle).toBeCloseTo((0.8 - 0.05) / 0.95)
    expect(s.brake).toBeCloseTo((0.3 - 0.05) / 0.95)
  })

  it('sticks resting inside the deadzone give exactly zero', () => {
    const s = new GamepadSource(() => [pad({ 0: STICK_DEADZONE * 0.9, 2: -STICK_DEADZONE * 0.5 }, { 7: 0.03 })]).read()!
    expect(s.steer).toBe(0)
    expect(s.drift).toBe(0)
    expect(s.throttle).toBe(0)
  })

  it('A is the handbrake-drift; Start, X and Y fire once per press', () => {
    let buttons: Partial<Record<number, number>> = { 0: 1, 9: 1, 3: 1 }
    const src = new GamepadSource(() => [pad({}, buttons)])
    const first = src.read()!
    expect(first.handbrake).toBe(true)
    expect(first.pause).toBe(true)
    expect(first.reset).toBe(true)
    const held = src.read()!
    expect(held.pause).toBe(false)
    expect(held.reset).toBe(false)
    expect(held.handbrake).toBe(true)
    buttons = { 2: 1 }
    expect(src.read()!.camera).toBe(true)
  })

  it('ignores missing and disconnected pads', () => {
    expect(new GamepadSource(() => [null]).read()).toBeNull()
    expect(new GamepadSource(() => [{ ...pad({ 0: 1 }), connected: false } as Gamepad]).read()).toBeNull()
  })

  it('prefers a standard-mapped pad, else falls back to the first connected one', () => {
    const odd = { ...pad({ 0: -1, 2: 1 }), index: 0, mapping: '' } as Gamepad
    const std = { ...pad({ 0: 1 }), index: 1 } as Gamepad
    expect(new GamepadSource(() => [odd, std]).read()!.steer).toBe(1)
    const fallback = new GamepadSource(() => [null, odd]).read()!
    expect(fallback.steer).toBe(-1)
    expect(fallback.drift).toBe(1)
    // two-axis pads have no right stick to trust
    const twoAxis = { ...pad({ 0: 1 }), axes: [1, 0.9], mapping: '' } as unknown as Gamepad
    expect(new GamepadSource(() => [twoAxis]).read()!.drift).toBe(0)
  })

  it('switching pads forgets the old pad buttons (a held button on the new pad fires once)', () => {
    const a = { ...pad({}, { 3: 1 }), index: 0, id: 'pad A' } as Gamepad
    const b = { ...pad({}, { 3: 1 }), index: 1, id: 'pad B' } as Gamepad
    let pads: (Gamepad | null)[] = [a]
    const src = new GamepadSource(() => pads)
    expect(src.read()!.reset).toBe(true)
    expect(src.read()!.reset).toBe(false)
    pads = [null, b]
    expect(src.read()!.reset).toBe(true)
  })
})

describe('InputController + gamepad', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads navigator.getGamepads by default and merges the pad with the keyboard', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [pad({ 2: -1 }, { 7: 1 })] })
    const input = new InputController(new EventTarget())
    const s = input.read(0.016)
    expect(s.drift).toBe(-1)
    expect(s.throttle).toBe(1)
    expect(s.steer).toBe(0)
  })
})
