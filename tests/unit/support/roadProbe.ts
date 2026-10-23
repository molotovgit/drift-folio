import RAPIER from '@dimforge/rapier3d-compat'

/**
 * Headless "probe wheel" for road-surface regression tests: casts rays straight
 * down through a Rapier world built from the real colliders and measures how
 * smooth the surface a tyre would ride over is.
 */

export interface ProbePoint {
  x: number
  z: number
  /** expected surface height (the ray starts a little above it) */
  y: number
}

export interface ProbeTrace {
  /** surface height under each sample, NaN where nothing was hit */
  h: number[]
  /** surface tag under each sample ('road', 'terrain', … or null) */
  tag: (string | null)[]
}

export interface BumpReport {
  /** largest vertical step between consecutive samples beyond the local grade, metres */
  step: number
  /** largest change of grade across a ±KINK_WINDOW m window (rise/run) */
  kink: number
  /** samples where the tyre would not be on a road-tagged collider */
  offRoad: number
  /** sample index of the worst step (for messages) */
  at: number
}

/** spacing of the probe samples along a path, metres */
export const PROBE_STEP = 0.25
const KINK_WINDOW = 2
/** rays start this far above the expected surface */
const RAY_HEAD = 2.5

export class RoadProbe {
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })

  constructor(
    private readonly world: RAPIER.World,
    private readonly surfaceOf: Map<number, string>,
  ) {
    // build the query pipeline's acceleration structure once
    world.step()
  }

  /** Height and tag of the first surface below (x, y + RAY_HEAD, z). */
  sample(x: number, y: number, z: number): { h: number; tag: string | null } {
    this.ray.origin = { x, y: y + RAY_HEAD, z }
    const hit = this.world.castRay(this.ray, RAY_HEAD * 2 + 2, true)
    if (!hit) return { h: NaN, tag: null }
    return { h: y + RAY_HEAD - hit.timeOfImpact, tag: this.surfaceOf.get(hit.collider.handle) ?? null }
  }

  /** Probe a polyline resampled every PROBE_STEP metres. */
  trace(path: readonly ProbePoint[]): ProbeTrace {
    const out: ProbeTrace = { h: [], tag: [] }
    for (const p of RoadProbe.resample(path)) {
      const s = this.sample(p.x, p.y, p.z)
      out.h.push(s.h)
      out.tag.push(s.tag)
    }
    return out
  }

  /** Steps, grade kinks and off-road samples along a trace. */
  static bumps(t: ProbeTrace): BumpReport {
    const h = t.h
    const w = Math.round(KINK_WINDOW / PROBE_STEP)
    const r: BumpReport = { step: 0, kink: 0, offRoad: t.tag.filter((g) => g !== 'road').length, at: -1 }
    for (let i = 2; i < h.length; i++) {
      // second difference: a pure grade contributes ~0, a step of s contributes s
      const s = Math.abs(h[i] - 2 * h[i - 1] + h[i - 2])
      if (s > r.step || Number.isNaN(s)) {
        r.step = Number.isNaN(s) ? Infinity : s
        r.at = i
      }
    }
    for (let i = w; i + w < h.length; i++) {
      const before = (h[i] - h[i - w]) / KINK_WINDOW
      const after = (h[i + w] - h[i]) / KINK_WINDOW
      r.kink = Math.max(r.kink, Math.abs(after - before))
    }
    return r
  }

  /**
   * Linear resample of a polyline at PROBE_STEP spacing. Starts a little in,
   * so probes never line up with the 2 m mesh rows (a ray exactly through a
   * shared triangle edge can slip between the triangles).
   */
  static resample(path: readonly ProbePoint[]): ProbePoint[] {
    const out: ProbePoint[] = []
    let carry = PROBE_STEP - 0.13
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]
      const b = path[i]
      const seg = Math.hypot(b.x - a.x, b.z - a.z)
      let d = PROBE_STEP - carry
      while (d <= seg) {
        const k = d / seg
        out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k })
        d += PROBE_STEP
      }
      carry = seg - (d - PROBE_STEP)
    }
    return out
  }
}
