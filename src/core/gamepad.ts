import type { AnalogSource, ControlState } from './input'
import { clamp } from './math'

/** Stick deadzone (fraction of full deflection); output is rescaled so it starts from 0. */
export const STICK_DEADZONE = 0.15
/** Trigger deadzone: resting triggers on some pads report a few percent. */
export const TRIGGER_DEADZONE = 0.05

/** Standard-mapping indices (https://w3c.github.io/gamepad/#remapping). */
const BTN = { a: 0, b: 1, x: 2, y: 3, lt: 6, rt: 7, start: 9 } as const
const AXIS = { leftX: 0, rightX: 2 } as const

/** Remove the deadzone and rescale the rest to 0..1 (keeps the sign). */
export function applyDeadzone(v: number, deadzone: number): number {
  const a = Math.abs(v)
  if (a <= deadzone) return 0
  return clamp((Math.sign(v) * (a - deadzone)) / (1 - deadzone), -1, 1)
}

/**
 * Twin-stick gamepad (Gamepad API, standard mapping): left stick X steers the
 * path, right stick X sets the drift angle, RT/LT are analog throttle/brake,
 * A = handbrake-drift, B horn, X camera, Y reset, Start/Options = pause.
 * Uses the first connected standard-mapped pad, else the first connected pad
 * read with the same indices (most XInput-style pads match; the right stick
 * is only trusted when the pad has four axes). A non-standard device may be a
 * wheel, flight stick or HID keyboard whose inputs rest at full scale (a
 * pedal on axis 2 at +1), so each of its axes and buttons is ignored until it
 * has been seen at rest. One-shot buttons fire on the press edge only;
 * switching pads forgets the old pad's buttons and rest flags.
 */
export class GamepadSource implements AnalogSource {
  private prevPressed: boolean[] = []
  /** index + id of the pad read last frame */
  private activeKey = ''
  /** non-standard pad only: axes ('a0') and buttons ('b6') seen at rest, so trusted */
  private readonly seenAtRest = new Set<string>()

  constructor(private readonly getGamepads: () => (Gamepad | null)[] = () => navigator.getGamepads?.() ?? []) {}

  /** The pad to read: a standard-mapped one if any, else the first connected one. */
  private pick(): Gamepad | undefined {
    const pads = this.getGamepads().filter((p): p is Gamepad => !!p && p.connected !== false)
    return pads.find((p) => p.mapping === 'standard') ?? pads[0]
  }

  read(): Partial<ControlState> | null {
    const pad = this.pick()
    const key = pad ? `${pad.index}:${pad.id}` : ''
    if (key !== this.activeKey) {
      // a different pad: no stale edges, and its inputs must prove they rest
      this.prevPressed = []
      this.seenAtRest.clear()
    }
    this.activeKey = key
    if (!pad) return null
    const standard = pad.mapping === 'standard'
    const trusted = (name: string, atRest: boolean) => {
      if (standard) return true
      if (atRest) this.seenAtRest.add(name)
      return this.seenAtRest.has(name)
    }
    const buttons = pad.buttons.map((b, i) =>
      trusted(`b${i}`, !b.pressed && b.value <= TRIGGER_DEADZONE) ? { value: b.value, pressed: b.pressed } : { value: 0, pressed: false },
    )
    const axis = (i: number) => {
      const v = pad.axes[i] ?? 0
      return trusted(`a${i}`, Math.abs(v) <= STICK_DEADZONE) ? applyDeadzone(v, STICK_DEADZONE) : 0
    }
    const value = (i: number) => buttons[i]?.value ?? 0
    const pressed = buttons.map((b) => b.pressed)
    const edge = (i: number) => !!pressed[i] && !this.prevPressed[i]
    const out: Partial<ControlState> = {
      steer: axis(AXIS.leftX),
      drift: pad.axes.length >= 4 ? axis(AXIS.rightX) : 0,
      throttle: applyDeadzone(value(BTN.rt), TRIGGER_DEADZONE),
      brake: applyDeadzone(value(BTN.lt), TRIGGER_DEADZONE),
      handbrake: value(BTN.a) > 0.5,
      horn: value(BTN.b) > 0.5,
      camera: edge(BTN.x),
      reset: edge(BTN.y),
      pause: edge(BTN.start),
    }
    this.prevPressed = pressed
    return out
  }
}
