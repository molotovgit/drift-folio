import { clamp } from './math'

export interface ControlState {
  throttle: number
  brake: number
  /** -1 = full left, +1 = full right */
  steer: number
  handbrake: boolean
  clutch: boolean
  /** one-shot buttons: true on the frame they were pressed */
  reset: boolean
  camera: boolean
  horn: boolean
  mute: boolean
}

export const idleControls = (): ControlState => ({
  throttle: 0, brake: 0, steer: 0, handbrake: false, clutch: false, reset: false, camera: false, horn: false, mute: false,
})

/** Extra analog sources (touch controls) merge into the keyboard state. */
export interface AnalogSource {
  read(): Partial<ControlState> | null
}

const STEER_RAMP_SECONDS = 0.12
const STEER_RETURN_SECONDS = 0.08

const KEYS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  clutch: ['ShiftLeft', 'ShiftRight'],
  reset: ['KeyR'],
  camera: ['KeyC'],
  horn: ['KeyH'],
  mute: ['KeyM'],
} as const

const GAME_KEYS = new Set<string>(Object.values(KEYS).flat())

export interface Input {
  read(dt: number): ControlState
  addSource(s: AnalogSource): void
  dispose(): void
}

export function createInput(target: EventTarget, getGamepads: () => (Gamepad | null)[] = () => (navigator.getGamepads?.() ?? [])): Input {
  const down = new Set<string>()
  const pressed = new Set<string>()
  const sources: AnalogSource[] = []
  let steer = 0
  let prevPadButtons: boolean[] = []

  const onDown = (e: Event) => {
    const k = (e as KeyboardEvent).code
    const t = (e as KeyboardEvent).target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (!GAME_KEYS.has(k)) return
    if (k === 'Space' || k.startsWith('Arrow')) e.preventDefault()
    if (!down.has(k)) pressed.add(k)
    down.add(k)
  }
  const onUp = (e: Event) => void down.delete((e as KeyboardEvent).code)
  const onBlur = () => down.clear()

  target.addEventListener('keydown', onDown)
  target.addEventListener('keyup', onUp)
  target.addEventListener('blur', onBlur)

  const any = (codes: readonly string[]) => codes.some((c) => down.has(c))
  const once = (codes: readonly string[]) => codes.some((c) => pressed.has(c))

  return {
    read(dt) {
      const s = idleControls()
      s.throttle = any(KEYS.throttle) ? 1 : 0
      s.brake = any(KEYS.brake) ? 1 : 0
      s.handbrake = any(KEYS.handbrake)
      s.clutch = any(KEYS.clutch)
      s.reset = once(KEYS.reset)
      s.camera = once(KEYS.camera)
      s.horn = any(KEYS.horn)
      s.mute = once(KEYS.mute)
      pressed.clear()

      const want = (any(KEYS.right) ? 1 : 0) - (any(KEYS.left) ? 1 : 0)
      const returning = want === 0 || (steer !== 0 && Math.sign(want) !== Math.sign(steer))
      const rate = returning ? 1 / STEER_RETURN_SECONDS : 1 / STEER_RAMP_SECONDS
      const step = rate * dt
      steer = Math.abs(want - steer) <= step ? want : steer + Math.sign(want - steer) * step
      s.steer = steer

      // Standard-mapping gamepad overrides when it is being used.
      const pad = getGamepads().find((p): p is Gamepad => !!p && p.mapping === 'standard')
      if (pad) {
        const btn = (i: number) => pad.buttons[i]?.value ?? 0
        const ax = pad.axes[0] ?? 0
        if (Math.abs(ax) > 0.12) s.steer = clamp(ax, -1, 1)
        s.throttle = Math.max(s.throttle, btn(7))
        s.brake = Math.max(s.brake, btn(6))
        s.handbrake ||= btn(0) > 0.5
        s.clutch ||= btn(5) > 0.5
        const now = pad.buttons.map((b) => b.pressed)
        const edge = (i: number) => !!now[i] && !prevPadButtons[i]
        s.reset ||= edge(3)
        s.camera ||= edge(2)
        s.horn ||= btn(1) > 0.5
        prevPadButtons = now
      }

      for (const src of sources) {
        const v = src.read()
        if (!v) continue
        if (v.steer !== undefined && Math.abs(v.steer) > Math.abs(s.steer)) s.steer = v.steer
        if (v.throttle !== undefined) s.throttle = Math.max(s.throttle, v.throttle)
        if (v.brake !== undefined) s.brake = Math.max(s.brake, v.brake)
        s.handbrake ||= !!v.handbrake
        s.reset ||= !!v.reset
        s.camera ||= !!v.camera
      }
      return s
    },
    addSource: (s) => void sources.push(s),
    dispose() {
      target.removeEventListener('keydown', onDown)
      target.removeEventListener('keyup', onUp)
      target.removeEventListener('blur', onBlur)
    },
  }
}
