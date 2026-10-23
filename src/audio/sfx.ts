/**
 * One-shot effects and the horn. Each one-shot builds short-lived nodes that
 * stop themselves; the browser frees them after `ended`.
 */
import { filterNode, gainNode, glide } from './nodes'

/** Bank stamp: major triad (C5 E5 G5), Hz, rising note by note. */
const STAMP_NOTES = [523.25, 659.25, 783.99]
const STAMP_STEP = 0.06 // s between notes
/** Horn: two squares a major third apart, Hz (the classic dual-tone car horn). */
const HORN_HZ = [400, 500]
const HORN_LEVEL = 0.07
/** Horn attack/release time constant, seconds: quick but click-free. */
const HORN_TAU = 0.012

export class Sfx {
  private readonly hornOut: GainNode

  /** @param noise shared white-noise buffer for bursts */
  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
    private readonly noise: AudioBuffer,
  ) {
    // horn oscillators run continuously at zero gain so press/release is just a glide
    const hornFilter = filterNode(ctx, 'lowpass', 1800, 0.7)
    this.hornOut = gainNode(ctx, 0)
    hornFilter.connect(this.hornOut).connect(out)
    for (const hz of HORN_HZ) {
      const osc = ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.value = hz
      osc.connect(hornFilter)
      osc.start()
    }
  }

  /** Horn level follows the held button. */
  setHorn(held: boolean): void {
    glide(this.hornOut.gain, held ? HORN_LEVEL : 0, this.ctx, HORN_TAU)
  }

  /** Score banked: a short rising triad. */
  bank(): void {
    const t = this.ctx.currentTime
    STAMP_NOTES.forEach((hz, i) => this.tone('triangle', hz, t + i * STAMP_STEP, 0.22, 0.16))
  }

  /** Multiplier went up: a blip that climbs with the multiplier (×2..×5). */
  multiplier(value: number): void {
    const hz = 700 + 120 * Math.min(Math.max(value, 1), 5)
    this.tone('square', hz, this.ctx.currentTime, 0.07, 0.06)
  }

  /** Crash: noise burst for the impact plus a pitch-dropping thud for the body. */
  crash(): void {
    const t = this.ctx.currentTime
    this.noiseBurst(t, 0.35, 0.35, filterNode(this.ctx, 'lowpass', 1400, 0.7))
    this.tone('sine', 90, t, 0.4, 0.5, 35)
  }

  /** Reset to checkpoint: a bandpassed noise sweep up and back down. */
  resetWhoosh(): void {
    const t = this.ctx.currentTime
    const band = filterNode(this.ctx, 'bandpass', 300, 1.5)
    band.frequency.setValueAtTime(300, t)
    band.frequency.exponentialRampToValueAtTime(2200, t + 0.25)
    band.frequency.exponentialRampToValueAtTime(400, t + 0.6)
    this.noiseBurst(t, 0.6, 0.3, band, 0.2)
  }

  /**
   * Enveloped oscillator: fast attack, exponential decay over `dur` s.
   * `endHz` glides the pitch (used for the thud).
   */
  private tone(type: OscillatorType, hz: number, t0: number, dur: number, peak: number, endHz?: number): void {
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(hz, t0)
    if (endHz !== undefined) osc.frequency.exponentialRampToValueAtTime(endHz, t0 + dur)
    const env = this.envelope(t0, dur, peak, 0.005)
    osc.connect(env).connect(this.out)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  /** Noise through `filter` with an attack of `attack` s then exponential decay to `t0 + dur`. */
  private noiseBurst(t0: number, dur: number, peak: number, filter: BiquadFilterNode, attack = 0.004): void {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const env = this.envelope(t0, dur, peak, attack)
    src.connect(filter).connect(env).connect(this.out)
    src.start(t0)
    src.stop(t0 + dur + 0.05)
  }

  /** Gain node scheduled 0 → peak (linear, `attack` s) → ~0 (exponential) at t0 + dur. */
  private envelope(t0: number, dur: number, peak: number, attack: number): GainNode {
    const env = gainNode(this.ctx, 0)
    env.gain.setValueAtTime(0, t0)
    env.gain.linearRampToValueAtTime(peak, t0 + attack)
    // exponential ramps cannot reach 0; 1e-4 is −80 dB, inaudible
    env.gain.exponentialRampToValueAtTime(1e-4, t0 + dur)
    return env
  }
}
