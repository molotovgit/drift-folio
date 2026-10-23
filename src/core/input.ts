import { GamepadSource } from './gamepad'

/**
 * One frame of driver intent. Analog values are 0..1 (steer and drift -1..1).
 * Twin-axis driving: `steer` bends the car's path, `drift` swings the body
 * out to a slip angle relative to that path.
 */
export interface ControlState {
  throttle: number
  brake: number
  /** path steering: -1 = full left, +1 = full right */
  steer: number
  /** drift angle: -1 = full drift left, +1 = full drift right (0 = grip driving) */
  drift: number
  /** legacy handbrake: drifts in the steer direction (Space, touch DRIFT, pad A) */
  handbrake: boolean
  /** one-shot buttons: true only on the frame they were pressed */
  reset: boolean
  camera: boolean
  /** held while the horn key is down */
  horn: boolean
  /** one-shot */
  mute: boolean
  /** one-shot: toggle the pause / skip overlay (gamepad Start) */
  pause: boolean
}

export const idleControls = (): ControlState => ({
  throttle: 0, brake: 0, steer: 0, drift: 0, handbrake: false, reset: false, camera: false, horn: false, mute: false, pause: false,
})

/** Extra analog sources (gamepad, on-screen touch controls) merge into the keyboard state. */
export interface AnalogSource {
  read(): Partial<ControlState> | null
}

const KEYS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  driftLeft: ['KeyJ'],
  driftRight: ['KeyL'],
  handbrake: ['Space'],
  reset: ['KeyR'],
  camera: ['KeyC'],
  horn: ['KeyH'],
  mute: ['KeyM'],
} as const

const GAME_KEYS = new Set<string>(Object.values(KEYS).flat())

/**
 * A digital key pair as an analog axis: ramps in over `rampSeconds` and back
 * (or through zero) over `returnSeconds`, so a tap gives a partial input.
 */
class KeyAxis {
  value = 0

  constructor(
    private readonly rampSeconds: number,
    private readonly returnSeconds: number,
  ) {}

  update(want: number, dt: number): number {
    const returning = want === 0 || (this.value !== 0 && Math.sign(want) !== Math.sign(this.value))
    const step = (returning ? 1 / this.returnSeconds : 1 / this.rampSeconds) * dt
    this.value = Math.abs(want - this.value) <= step ? want : this.value + Math.sign(want - this.value) * step
    return this.value
  }
}

/** Merges keyboard, gamepad and touch sources into a ControlState. */
export class InputController {
  private readonly down = new Set<string>()
  private readonly pressed = new Set<string>()
  private readonly sources: AnalogSource[] = []
  /** keyboard steering ramps in/out instead of snapping to full lock */
  private readonly steerAxis = new KeyAxis(0.12, 0.08)
  /** keyboard drift ramps a little slower, so a tap of J/L asks for a shallow angle */
  private readonly driftAxis = new KeyAxis(0.18, 0.1)

  constructor(
    private readonly target: EventTarget,
    getGamepads?: () => (Gamepad | null)[],
  ) {
    target.addEventListener('keydown', this.onKeyDown)
    target.addEventListener('keyup', this.onKeyUp)
    target.addEventListener('blur', this.onBlur)
    this.sources.push(new GamepadSource(getGamepads))
  }

  addSource(source: AnalogSource): void {
    this.sources.push(source)
  }

  /** Read this frame's controls; `dt` drives the keyboard steer/drift ramps. */
  read(dt: number): ControlState {
    const s = idleControls()
    s.throttle = this.any(KEYS.throttle) ? 1 : 0
    s.brake = this.any(KEYS.brake) ? 1 : 0
    s.handbrake = this.any(KEYS.handbrake)
    s.reset = this.once(KEYS.reset)
    s.camera = this.once(KEYS.camera)
    s.horn = this.any(KEYS.horn)
    s.mute = this.once(KEYS.mute)
    this.pressed.clear()
    s.steer = this.steerAxis.update(this.pair(KEYS.left, KEYS.right), dt)
    s.drift = this.driftAxis.update(this.pair(KEYS.driftLeft, KEYS.driftRight), dt)
    this.readSources(s)
    return s
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown)
    this.target.removeEventListener('keyup', this.onKeyUp)
    this.target.removeEventListener('blur', this.onBlur)
  }

  /** -1 / 0 / +1 from a negative and a positive key set (both held cancel out). */
  private pair(neg: readonly string[], pos: readonly string[]): number {
    return (this.any(pos) ? 1 : 0) - (this.any(neg) ? 1 : 0)
  }

  /** Axes: the strongest source wins; pedals: the max; buttons: any source. */
  private readSources(s: ControlState): void {
    for (const src of this.sources) {
      const v = src.read()
      if (!v) continue
      if (v.steer !== undefined && Math.abs(v.steer) > Math.abs(s.steer)) s.steer = v.steer
      if (v.drift !== undefined && Math.abs(v.drift) > Math.abs(s.drift)) s.drift = v.drift
      if (v.throttle !== undefined) s.throttle = Math.max(s.throttle, v.throttle)
      if (v.brake !== undefined) s.brake = Math.max(s.brake, v.brake)
      s.handbrake ||= !!v.handbrake
      s.reset ||= !!v.reset
      s.camera ||= !!v.camera
      s.horn ||= !!v.horn
      s.mute ||= !!v.mute
      s.pause ||= !!v.pause
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
