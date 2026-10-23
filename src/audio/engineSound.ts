/**
 * Synthesised two-rotor engine: detuned saws at the firing frequency plus a
 * square sub-octave (the rotary "brap"), soft-clipped and lowpassed.
 */
import { IDLE_RPM, engineCutoffHz, engineGain, engineRpm, firingHz } from './audioMath'
import { filterNode, gainNode, glide } from './nodes'

/** Saw detune, cents: the beating between the two saws thickens the tone. */
const DETUNE_CENTS = 9
/** Wheels spin up in a drift, so the revs read higher than road speed; speed multiplier. */
const WHEELSPIN = 1.15
/** Overall engine level relative to the other buses. */
const ENGINE_LEVEL = 0.32
/** Pitch glide, seconds: slower than the default so gear changes swoop rather than step. */
const PITCH_TAU = 0.06

export class EngineSound {
  private readonly oscillators: OscillatorNode[]
  /** each oscillator's frequency as a multiple of the firing rate */
  private readonly multiples: number[]
  private readonly filter: BiquadFilterNode
  private readonly out: GainNode
  private rpm = 0

  constructor(private readonly ctx: BaseAudioContext, destination: AudioNode) {
    this.out = gainNode(ctx, 0)
    this.filter = filterNode(ctx, 'lowpass', 600, 2.5)
    const shaper = ctx.createWaveShaper()
    shaper.curve = EngineSound.softClipCurve(2.5)
    shaper.oversample = '2x'
    const mix = gainNode(ctx, 0.35)

    // [type, frequency multiple of the firing rate, detune cents, mix level]
    const voices: Array<[OscillatorType, number, number, number]> = [
      ['sawtooth', 1, -DETUNE_CENTS, 0.6],
      ['sawtooth', 1, DETUNE_CENTS, 0.5],
      ['square', 0.5, 0, 0.45],
    ]
    this.oscillators = voices.map(([type, multiple, cents, level]) => {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = firingHz(IDLE_RPM) * multiple
      osc.detune.value = cents
      const g = gainNode(ctx, level)
      osc.connect(g).connect(mix)
      osc.start()
      return osc
    })
    this.multiples = voices.map((v) => v[1])

    mix.connect(shaper).connect(this.filter).connect(this.out).connect(destination)
  }

  /** Current engine speed, rpm (for debugging/HUD). */
  get currentRpm(): number {
    return this.rpm
  }

  /**
   * Per frame. `speed` m/s, `throttle` 0..1; `drifting` adds wheelspin revs.
   */
  update(speed: number, throttle: number, drifting: boolean): void {
    this.rpm = engineRpm(drifting ? speed * WHEELSPIN : speed, throttle)
    const hz = firingHz(this.rpm)
    this.oscillators.forEach((osc, i) => glide(osc.frequency, hz * this.multiples[i], this.ctx, PITCH_TAU))
    glide(this.filter.frequency, engineCutoffHz(this.rpm, throttle), this.ctx)
    glide(this.out.gain, ENGINE_LEVEL * engineGain(this.rpm, throttle), this.ctx)
  }

  /** tanh soft-clip transfer curve; `drive` > 1 adds odd harmonics (grit). */
  private static softClipCurve(drive: number): Float32Array<ArrayBuffer> {
    const n = 1024
    const curve = new Float32Array(n)
    const norm = Math.tanh(drive)
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1
      curve[i] = Math.tanh(drive * x) / norm
    }
    return curve
  }
}
