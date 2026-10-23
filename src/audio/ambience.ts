/**
 * Zone ambience: mountain wind (gusting filtered noise), tunnel reverb on the
 * engine bus (synthetic-impulse convolver) and town crickets (pulsed sine chirps).
 * Zones crossfade by gliding each layer's level, so boundaries never click.
 */
import { windRush, type Zone } from './audioMath'
import { filterNode, gainNode, glide, loopSource } from './nodes'

interface ZoneMix {
  /** wind base level */
  wind: number
  /** how much driving speed adds wind rush (open mountain air 1, enclosed less) */
  rush: number
  /** reverb wet level on the engine bus */
  reverb: number
  /** cricket bus level */
  crickets: number
}

const ZONE_MIX: Record<Zone, ZoneMix> = {
  mountain: { wind: 0.1, rush: 1, reverb: 0, crickets: 0 },
  tunnel: { wind: 0.015, rush: 0.2, reverb: 0.55, crickets: 0 },
  town: { wind: 0.03, rush: 0.3, reverb: 0, crickets: 0.05 },
}

/** Zone crossfade time constant, seconds (~1.5 s to settle). */
const ZONE_TAU = 0.5
/** Extra wind level at speed (added to the zone base). */
const WIND_RUSH_LEVEL = 0.12
/** Tunnel impulse response length, seconds. */
const REVERB_SECONDS = 1.8
/** Keep the convolver fed this long after leaving the tunnel so the tail fades out, seconds. */
const REVERB_RELEASE = 2.5
/** Cricket chirp: carrier Hz, pulses per chirp, pulse spacing s. */
const CHIRP_HZ = 4300
const CHIRP_PULSES = 3
const CHIRP_SPACING = 0.045
/** Schedule chirps this far ahead of the audio clock, seconds (covers frame jitter). */
const LOOKAHEAD = 0.2

export class Ambience {
  private readonly windOut: GainNode
  private readonly reverbIn: ConvolverNode
  private readonly reverbWet: GainNode
  private readonly chirpEnv: GainNode
  private readonly chirpOsc: OscillatorNode
  private readonly cricketsOut: GainNode
  private zone: Zone | null = null
  /** audio-clock time until which the convolver stays connected (0 = disconnected) */
  private reverbFedUntil = 0
  private nextChirpAt = 0

  /**
   * @param destination ambience output (master)
   * @param reverbSource bus to reverberate in tunnels (the engine/tyre bus)
   * @param noise shared looping white-noise buffer
   */
  constructor(
    private readonly ctx: BaseAudioContext,
    destination: AudioNode,
    private readonly reverbSource: AudioNode,
    noise: AudioBuffer,
  ) {
    // wind: lowpassed noise with a slow LFO on level and cutoff for gusts
    const windFilter = filterNode(ctx, 'lowpass', 450, 0.7)
    this.windOut = gainNode(ctx, 0)
    loopSource(ctx, noise).connect(windFilter).connect(this.windOut).connect(destination)
    const gust = ctx.createOscillator()
    gust.frequency.value = 0.11 // Hz, one gust every ~9 s
    gust.connect(gainNode(ctx, 0.03)).connect(this.windOut.gain)
    gust.connect(gainNode(ctx, 180)).connect(windFilter.frequency) // ±180 Hz
    gust.start()

    // tunnel: convolver fed from the engine bus only while needed (convolution is not free on phones)
    this.reverbIn = ctx.createConvolver()
    this.reverbIn.buffer = Ambience.impulse(ctx, REVERB_SECONDS)
    this.reverbWet = gainNode(ctx, 0)
    this.reverbIn.connect(this.reverbWet).connect(destination)

    // crickets: one sine whose gain envelope is pulsed by the scheduler
    this.chirpOsc = ctx.createOscillator()
    this.chirpOsc.frequency.value = CHIRP_HZ
    this.chirpEnv = gainNode(ctx, 0)
    this.cricketsOut = gainNode(ctx, 0)
    this.chirpOsc.connect(this.chirpEnv).connect(this.cricketsOut).connect(destination)
    this.chirpOsc.start()
  }

  /** Per frame. `speed` m/s feeds the wind rush. */
  update(zone: Zone, speed: number): void {
    const now = this.ctx.currentTime
    const mix = ZONE_MIX[zone]
    if (zone !== this.zone) {
      this.zone = zone
      glide(this.reverbWet.gain, mix.reverb, this.ctx, ZONE_TAU)
      glide(this.cricketsOut.gain, mix.crickets, this.ctx, ZONE_TAU)
    }
    glide(this.windOut.gain, mix.wind + WIND_RUSH_LEVEL * mix.rush * windRush(speed), this.ctx, ZONE_TAU)
    this.gateReverb(mix.reverb > 0, now)
    if (mix.crickets > 0) this.scheduleChirps(now)
  }

  /** Connect the convolver while reverb is wanted, release it once the tail has faded. */
  private gateReverb(wanted: boolean, now: number): void {
    if (wanted) {
      if (this.reverbFedUntil === 0) this.reverbSource.connect(this.reverbIn)
      this.reverbFedUntil = now + REVERB_RELEASE
    } else if (this.reverbFedUntil !== 0 && now > this.reverbFedUntil) {
      this.reverbSource.disconnect(this.reverbIn)
      this.reverbFedUntil = 0
    }
  }

  /** Queue chirps on the audio clock up to LOOKAHEAD ahead; random gaps of 0.4–2.4 s. */
  private scheduleChirps(now: number): void {
    if (this.nextChirpAt < now) this.nextChirpAt = now + 0.05
    while (this.nextChirpAt < now + LOOKAHEAD) {
      const t0 = this.nextChirpAt
      // slight pitch variation per chirp so it reads as several insects
      this.chirpOsc.frequency.setValueAtTime(CHIRP_HZ * (0.94 + Math.random() * 0.12), t0)
      for (let p = 0; p < CHIRP_PULSES; p++) {
        const t = t0 + p * CHIRP_SPACING
        this.chirpEnv.gain.setValueAtTime(0, t)
        this.chirpEnv.gain.linearRampToValueAtTime(1, t + 0.008)
        this.chirpEnv.gain.linearRampToValueAtTime(0, t + 0.03)
      }
      this.nextChirpAt = t0 + 0.4 + Math.random() * 2
    }
  }

  /** Synthetic room impulse: stereo noise with an exponential decay (−60 dB over `seconds`). */
  private static impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds))
    const ir = ctx.createBuffer(2, length, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch)
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1e-3, i / length) // amplitude 1 → 0.001 = −60 dB
        data[i] = (Math.random() * 2 - 1) * decay
      }
    }
    return ir
  }
}
