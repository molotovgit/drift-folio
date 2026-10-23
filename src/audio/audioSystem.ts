/**
 * Owner of the Web Audio graph (plan M8). All sound is synthesised, no files.
 *
 * Lifecycle: constructing this is free — no AudioContext exists until the
 * first `unlock()` from a user gesture (browser autoplay policy, and the plan's
 * "audio graph not created before first user input"). Before that, `update`
 * and `event` are no-ops and mute is only remembered.
 *
 * Graph:  engine + tyres → vehicle bus ─┬→ master → limiter → speakers
 *                                       └→ (tunnel) reverb ┘
 *         ambience, sfx ───────────────────→ master
 */
import type { ScoreEvent } from '../game/driftScore'
import type { SafeStorage } from '../util/storage'
import { Ambience } from './ambience'
import type { Surface, Zone } from './audioMath'
import { EngineSound } from './engineSound'
import { createNoiseBuffer, gainNode, glide } from './nodes'
import { Sfx } from './sfx'
import { TyreSound } from './tyreSound'

/** Everything the audio needs from one simulation frame. */
export interface AudioFrame {
  /** horizontal speed, m/s */
  speed: number
  /** 0..1 */
  throttle: number
  /** body slip angle β, degrees (sign ignored) */
  slipDeg: number
  drifting: boolean
  /** 0..4 */
  wheelsOnGround: number
  /** null = airborne */
  surface: Surface
  /** held state of the horn button */
  horn: boolean
  zone: Zone
}

export type AudioEvent = ScoreEvent | { type: 'reset' }

/** The bit of `document` we use, injectable for tests. */
export interface VisibilitySource {
  readonly hidden: boolean
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

export interface AudioSystemOptions {
  /** persists the mute flag under key 'muted' */
  storage: SafeStorage
  /** AudioContext factory; called once, on the first `unlock()` */
  createContext?: () => AudioContext
  /** defaults to `document` when present; null disables tab-visibility handling */
  visibility?: VisibilitySource | null
}

const MUTED_KEY = 'muted'
/** Master level, leaves headroom for the limiter. */
const MASTER_LEVEL = 0.8
/** Mute fade, seconds. */
const MUTE_TAU = 0.04
/** Shared noise buffer length, seconds: long enough that the loop point isn't audible. */
const NOISE_SECONDS = 2

/** Nodes that exist only after unlock. */
interface Graph {
  master: GainNode
  engine: EngineSound
  tyres: TyreSound
  ambience: Ambience
  sfx: Sfx
}

export class AudioSystem {
  private readonly storage: SafeStorage
  private readonly createContext: () => AudioContext
  private readonly visibility: VisibilitySource | null
  private ctx: AudioContext | null = null
  private graph: Graph | null = null
  /** Web Audio missing or context creation threw: stay silent, never retry */
  private unavailable = false
  private isMuted: boolean
  private readonly onVisibility = (): void => this.applyVisibility()

  constructor(opts: AudioSystemOptions) {
    this.storage = opts.storage
    this.createContext = opts.createContext ?? (() => new AudioContext({ latencyHint: 'interactive' }))
    this.visibility = opts.visibility === undefined ? AudioSystem.defaultVisibility() : opts.visibility
    this.isMuted = this.storage.get<boolean>(MUTED_KEY, false) === true
    this.visibility?.addEventListener('visibilitychange', this.onVisibility)
  }

  get muted(): boolean {
    return this.isMuted
  }

  /** True once the graph has been built. */
  get unlocked(): boolean {
    return this.graph !== null
  }

  /**
   * Create (first call) or resume the AudioContext. Call from user-gesture
   * handlers (keydown/pointerdown/touchstart); cheap and idempotent afterwards.
   */
  unlock(): void {
    if (this.unavailable) return
    if (!this.ctx) {
      try {
        this.ctx = this.createContext()
        this.graph = this.build(this.ctx)
      } catch {
        this.unavailable = true
        this.ctx = null
        this.graph = null
        return
      }
    }
    this.applyVisibility()
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted
    this.storage.set(MUTED_KEY, muted)
    this.applyMute()
  }

  /** Flip mute; returns the new state (for the HUD). */
  toggleMute(): boolean {
    this.setMuted(!this.isMuted)
    return this.isMuted
  }

  /** Per rendered frame. No-op before unlock. */
  update(f: AudioFrame): void {
    const g = this.graph
    if (!g) return
    g.engine.update(f.speed, f.throttle, f.drifting)
    g.tyres.update(f.slipDeg, f.speed, f.surface, f.wheelsOnGround)
    g.ambience.update(f.zone, f.speed)
    g.sfx.setHorn(f.horn)
  }

  /** One-shot cues from the scorer and the reset. No-op before unlock or while muted. */
  event(e: AudioEvent): void {
    const g = this.graph
    if (!g || this.isMuted) return
    switch (e.type) {
      case 'bank':
        g.sfx.bank()
        break
      case 'multiplier':
        g.sfx.multiplier(e.value)
        break
      case 'crash':
        g.sfx.crash()
        break
      case 'reset':
        g.sfx.resetWhoosh()
        break
      case 'start':
        break // the tyre squeal already marks a drift starting
    }
  }

  /** Stop listening and release the audio device. */
  dispose(): void {
    this.visibility?.removeEventListener('visibilitychange', this.onVisibility)
    void this.ctx?.close().catch(() => undefined)
    this.ctx = null
    this.graph = null
  }

  private build(ctx: AudioContext): Graph {
    // limiter so stacked one-shots over a loud engine never clip
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -6 // dBFS
    limiter.knee.value = 4 // dB
    limiter.ratio.value = 12
    limiter.connect(ctx.destination)

    const master = gainNode(ctx, this.isMuted ? 0 : MASTER_LEVEL)
    master.connect(limiter)
    const vehicleBus = gainNode(ctx, 1)
    vehicleBus.connect(master)

    const noise = createNoiseBuffer(ctx, NOISE_SECONDS)
    return {
      master,
      engine: new EngineSound(ctx, vehicleBus),
      tyres: new TyreSound(ctx, vehicleBus, noise),
      ambience: new Ambience(ctx, master, vehicleBus, noise),
      sfx: new Sfx(ctx, master, noise),
    }
  }

  private applyMute(): void {
    if (this.ctx && this.graph) glide(this.graph.master.gain, this.isMuted ? 0 : MASTER_LEVEL, this.ctx, MUTE_TAU)
  }

  /** Background tabs go silent (and stop costing CPU); coming back resumes. */
  private applyVisibility(): void {
    const ctx = this.ctx
    if (!ctx) return
    const hidden = this.visibility?.hidden ?? false
    if (hidden && ctx.state === 'running') void ctx.suspend().catch(() => undefined)
    else if (!hidden && ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  }

  private static defaultVisibility(): VisibilitySource | null {
    return typeof document === 'undefined' ? null : document
  }
}
