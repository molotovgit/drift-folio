/**
 * Tyre noise: a resonant bandpassed-noise squeal for drifts and a low
 * lowpassed-noise rumble for terrain. Both glide so onset/release never click.
 */
import { rumbleGain, squealGain, squealHz, type Surface } from './audioMath'
import { filterNode, gainNode, glide, loopSource } from './nodes'

/** Bus levels relative to the engine. */
const SQUEAL_LEVEL = 0.28
const RUMBLE_LEVEL = 0.45
/** Off-road tyres slide on dirt: much less squeal than on tarmac. */
const TERRAIN_SQUEAL = 0.3
/** Squeal fade, seconds: a little slower than the default glide so it tails off naturally. */
const SQUEAL_TAU = 0.06

export class TyreSound {
  private readonly squealFilter: BiquadFilterNode
  private readonly squealOut: GainNode
  private readonly rumbleFilter: BiquadFilterNode
  private readonly rumbleOut: GainNode

  /** @param noise shared looping white-noise buffer */
  constructor(private readonly ctx: BaseAudioContext, destination: AudioNode, noise: AudioBuffer) {
    // high Q makes noise ring like a tone — the tyre "scream"
    this.squealFilter = filterNode(ctx, 'bandpass', 1000, 14)
    this.squealOut = gainNode(ctx, 0)
    loopSource(ctx, noise).connect(this.squealFilter).connect(this.squealOut).connect(destination)

    this.rumbleFilter = filterNode(ctx, 'lowpass', 120, 0.8)
    this.rumbleOut = gainNode(ctx, 0)
    loopSource(ctx, noise).connect(this.rumbleFilter).connect(this.rumbleOut).connect(destination)
  }

  /**
   * Per frame. `slipDeg` body slip β in degrees, `speed` m/s, `wheelsOnGround` 0..4.
   */
  update(slipDeg: number, speed: number, surface: Surface, wheelsOnGround: number): void {
    const grip = surface === 'road' ? 1 : surface === 'terrain' ? TERRAIN_SQUEAL : 0
    glide(this.squealOut.gain, SQUEAL_LEVEL * grip * squealGain(slipDeg, speed), this.ctx, SQUEAL_TAU)
    glide(this.squealFilter.frequency, squealHz(speed), this.ctx)

    glide(this.rumbleOut.gain, RUMBLE_LEVEL * rumbleGain(speed, surface, wheelsOnGround), this.ctx)
    // bumps get busier with speed: open the rumble filter a little
    glide(this.rumbleFilter.frequency, 90 + 4 * Math.min(Math.abs(speed), 40), this.ctx)
  }
}
