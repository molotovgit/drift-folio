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
 * Uses the first connected standard-mapped pad. One-shot buttons fire on the
 * press edge only.
 */
export class GamepadSource implements AnalogSource {
  private prevPressed: boolean[] = []

  constructor(private readonly getGamepads: () => (Gamepad | null)[] = () => navigator.getGamepads?.() ?? []) {}

  read(): Partial<ControlState> | null {
    const pad = this.getGamepads().find((p): p is Gamepad => !!p && p.connected !== false && p.mapping === 'standard')
    if (!pad) {
      this.prevPressed = []
      return null
    }
    const value = (i: number) => pad.buttons[i]?.value ?? 0
    const pressed = pad.buttons.map((b) => b.pressed)
    const edge = (i: number) => !!pressed[i] && !this.prevPressed[i]
    const out: Partial<ControlState> = {
      steer: applyDeadzone(pad.axes[AXIS.leftX] ?? 0, STICK_DEADZONE),
      drift: applyDeadzone(pad.axes[AXIS.rightX] ?? 0, STICK_DEADZONE),
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
