import { MAX_FRAME } from '../core/loop'
import { parseTier, type QualityTier } from '../render/post'

/** Settings read once from the URL (validated at this boundary). */
export class GameOptions {
  /** `?debug` exposes `window.__drift` telemetry for tests */
  readonly debug: boolean
  /** `?quality=high|mid|low` overrides the device default */
  readonly quality: QualityTier | null
  /**
   * Longest frame the physics loop catches up on. Test-only `?debug&catchup`
   * lets slow software renderers run more ticks per frame (same physics, faster wall clock).
   */
  readonly maxFrame: number
  /** `?map=pad` loads the flat M1 test pad instead of the mountain (tests, handling tuning) */
  readonly map: 'mountain' | 'pad'

  constructor(search: string) {
    const params = new URLSearchParams(search)
    this.debug = params.has('debug')
    this.quality = parseTier(params.get('quality'))
    this.maxFrame = this.debug && params.has('catchup') ? 10 / 60 : MAX_FRAME
    this.map = params.get('map') === 'pad' ? 'pad' : 'mountain'
  }

  /** Adapt quality to the device at runtime? Not when a tier is forced or under test. */
  get adaptive(): boolean {
    return this.quality === null && !this.debug
  }

  /** Quality to use: explicit override, else mid on phones, high elsewhere. */
  qualityFor(isMobile: boolean): QualityTier {
    return this.quality ?? (isMobile ? 'mid' : 'high')
  }
}
