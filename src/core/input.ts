import { clamp } from './math'

/** One frame of driver intent. Analog values are 0..1 (steer -1..1). */
export interface ControlState {
  throttle: number
  brake: number
  /** -1 = full left, +1 = full right */
  steer: number
  handbrake: boolean
  clutch: boolean
  /** one-shot buttons: true only on the frame they were pressed */
  reset: boolean
  camera: boolean
  /** held while the horn key is down */
  horn: boolean
  /** one-shot */
  mute: boolean
}

export const idleControls = (): ControlState => ({
  throttle: 0, brake: 0, steer: 0, handbrake: false, clutch: false, reset: false, camera: false, horn: false, mute: false,
})

/** Extra analog sources (on-screen touch controls) merge into the keyboard state. */
export interface AnalogSource {
  read(): Partial<ControlState> | null
}

/** Keyboard steering ramps in/out instead of snapping to full lock. */
const STEER_RAMP_SECONDS = 0.12
const STEER_RETURN_SECONDS = 0.08
const GAMEPAD_DEADZONE = 0.12

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

/** Merges keyboard, standard-mapping gamepad and touch sources into a ControlState. */
export class InputController {
  private readonly down = new Set<string>()
  private readonly pressed = new Set<string>()
  private readonly sources: AnalogSource[] = []
  private steer = 0
  private prevPadButtons: boolean[] = []

  constructor(
    private readonly target: EventTarget,
    private readonly getGamepads: () => (Gamepad | null)[] = () => navigator.getGamepads?.() ?? [],
  ) {
    target.addEventListener('keydown', this.onKeyDown)
    target.addEventListener('keyup', this.onKeyUp)
    target.addEventListener('blur', this.onBlur)
  }

  addSource(source: AnalogSource): void {
    this.sources.push(source)
  }

  /** Read this frame's controls; `dt` drives the keyboard steering ramp. */
  read(dt: number): ControlState {
    const s = idleControls()
    s.throttle = this.any(KEYS.throttle) ? 1 : 0
    s.brake = this.any(KEYS.brake) ? 1 : 0
    s.handbrake = this.any(KEYS.handbrake)
    s.clutch = this.any(KEYS.clutch)
    s.reset = this.once(KEYS.reset)
    s.camera = this.once(KEYS.camera)
    s.horn = this.any(KEYS.horn)
    s.mute = this.once(KEYS.mute)
    this.pressed.clear()
    s.steer = this.rampSteer(dt)
    this.readGamepad(s)
    this.readSources(s)
    return s
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown)
    this.target.removeEventListener('keyup', this.onKeyUp)
    this.target.removeEventListener('blur', this.onBlur)
  }

  private rampSteer(dt: number): number {
    const want = (this.any(KEYS.right) ? 1 : 0) - (this.any(KEYS.left) ? 1 : 0)
    // returning to centre (or reversing direction) is quicker than turning in
    const returning = want === 0 || (this.steer !== 0 && Math.sign(want) !== Math.sign(this.steer))
    const step = (returning ? 1 / STEER_RETURN_SECONDS : 1 / STEER_RAMP_SECONDS) * dt
    this.steer = Math.abs(want - this.steer) <= step ? want : this.steer + Math.sign(want - this.steer) * step
    return this.steer
  }

  private readGamepad(s: ControlState): void {
    const pad = this.getGamepads().find((p): p is Gamepad => !!p && p.mapping === 'standard')
    if (!pad) return
    const btn = (i: number) => pad.buttons[i]?.value ?? 0
    const ax = pad.axes[0] ?? 0
    // rescale past the deadzone so steering starts from 0, not from 0.12
    if (Math.abs(ax) > GAMEPAD_DEADZONE) s.steer = clamp((Math.sign(ax) * (Math.abs(ax) - GAMEPAD_DEADZONE)) / (1 - GAMEPAD_DEADZONE), -1, 1)
    s.throttle = Math.max(s.throttle, btn(7))
    s.brake = Math.max(s.brake, btn(6))
    s.handbrake ||= btn(0) > 0.5
    s.clutch ||= btn(5) > 0.5
    const now = pad.buttons.map((b) => b.pressed)
    const edge = (i: number) => !!now[i] && !this.prevPadButtons[i]
    s.reset ||= edge(3)
    s.camera ||= edge(2)
    s.horn ||= btn(1) > 0.5
    this.prevPadButtons = now
  }

  private readSources(s: ControlState): void {
    for (const src of this.sources) {
      const v = src.read()
      if (!v) continue
      if (v.steer !== undefined && Math.abs(v.steer) > Math.abs(s.steer)) s.steer = v.steer
      if (v.throttle !== undefined) s.throttle = Math.max(s.throttle, v.throttle)
      if (v.brake !== undefined) s.brake = Math.max(s.brake, v.brake)
      s.handbrake ||= !!v.handbrake
      s.reset ||= !!v.reset
      s.camera ||= !!v.camera
    }
  }

  private any(codes: readonly string[]): boolean {
    return codes.some((c) => this.down.has(c))
  }

  private once(codes: readonly string[]): boolean {
    return codes.some((c) => this.pressed.has(c))
  }

  private readonly onKeyDown = (e: Event) => {
    const ev = e as KeyboardEvent
    const t = ev.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (!GAME_KEYS.has(ev.code)) return
    if (ev.code === 'Space' || ev.code.startsWith('Arrow')) e.preventDefault()
    if (!this.down.has(ev.code)) this.pressed.add(ev.code)
    this.down.add(ev.code)
  }

  private readonly onKeyUp = (e: Event) => void this.down.delete((e as KeyboardEvent).code)
  private readonly onBlur = () => this.down.clear()
}
