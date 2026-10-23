import type { Vec2 } from '../core/math'

/** grade budget the profiles are fitted against (spec: max gradient 14 %) */
export const MAX_GRADE = 0.14
/** no road near a junction ever leans sideways more than this (rise per metre) */
export const MAX_CROSS = 0.06
/** each road blends from the plane to its own grade over at most this distance */
export const BLEND = 40
/** and at least this distance when its grade budget is tight */
export const MIN_BLEND = 12
/** a junction plane may make a road at most this much steeper than its own natural grade */
const GRADE_SLACK = 0.025
/** at a node with a town street the plane is no steeper than the gentlest street plus this */
const TOWN_SLACK = 0.025
/** plane gradients are searched within ±MAX_GRADE on a grid this coarse, then on finer grids around the best */
const SEARCH_STEPS = [0.01, 0.001, 0.0001]
/** limits outweigh any plain misfit */
const HARD = 1e4

/** One road end as the plane fit sees it. */
export interface PlaneEnd {
  /** samples from the node out over the hold and blend: unit outward tangent and plane weight (1 on the hold) */
  samples: { t: Vec2; w: number }[]
  /** the road's own grade outward from the node (rise per metre to its far node) */
  grade: number
  length: number
  /** how far it lies exactly on the plane */
  hold: number
  town: boolean
}

/**
 * Chooses a node's height plane. Every road at the node follows the plane near
 * it, so the plane decides how steep each road starts and how much it leans
 * sideways. The plane is the gradient that keeps, for every road:
 *   - camber (plane slope across the road) within MAX_CROSS,
 *   - its grade near the node within its own grade + GRADE_SLACK (and MAX_GRADE),
 *   - the steeper middle it needs to make up the difference within the same limit,
 * and, at town nodes, a near-flat plane (gentlest street + TOWN_SLACK) — the
 * long mountain roads there absorb the difference over their blends. Within
 * those limits it fits every road's own grade, longest roads giving most.
 * The limits are not all satisfiable at every fork, so they are penalties and
 * the least-violating plane wins. Every term is convex in the gradient, so a
 * coarse-to-fine grid search over the small 2-D space finds the minimum.
 */
export class JunctionPlane {
  private readonly townCap: number

  constructor(private readonly ends: readonly PlaneEnd[]) {
    const town = ends.filter((e) => e.town).map((e) => Math.abs(e.grade))
    this.townCap = town.length ? Math.min(...town) + TOWN_SLACK : Infinity
  }

  /** The best plane gradient (rise per metre along +X and +Z). */
  solve(): Vec2 {
    let best = { x: 0, y: 0 }
    let span = MAX_GRADE
    for (const step of SEARCH_STEPS) {
      best = this.search(best, span, step)
      span = step
    }
    return best
  }

  /** Lowest-cost gradient on a square grid of half-size `span` around `c`. */
  private search(c: Vec2, span: number, step: number): Vec2 {
    let best = c
    let bestCost = this.cost(c.x, c.y)
    const n = Math.round(span / step)
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const gx = c.x + i * step
        const gy = c.y + j * step
        const k = this.cost(gx, gy)
        if (k < bestCost) {
          bestCost = k
          best = { x: gx, y: gy }
        }
      }
    }
    return best
  }

  private cost(gx: number, gy: number): number {
    const over = (v: number, limit: number) => Math.max(0, Math.abs(v) - limit)
    let hard = over(Math.hypot(gx, gy), Math.min(this.townCap, MAX_GRADE)) ** 2
    let soft = 0
    for (const e of this.ends) {
      const limit = Math.min(MAX_GRADE, Math.abs(e.grade) + GRADE_SLACK)
      for (const { t, w } of e.samples) {
        // left of the outward tangent; the sign does not matter for camber
        hard += over(w * (gx * t.y - gy * t.x), MAX_CROSS) ** 2
        if (w === 1) hard += over(gx * t.x + gy * t.y, limit) ** 2
      }
      // the road leaves the node at the plane's grade, so its middle must make up the rest
      const t0 = e.samples[0].t
      const start = gx * t0.x + gy * t0.y
      const near = e.hold + MIN_BLEND / 2
      const middle = e.grade + ((e.grade - start) * near) / Math.max(10, e.length - 2 * near)
      hard += over(middle, limit) ** 2
      soft += ((start - e.grade) ** 2 * 100) / e.length
    }
    // a hair of preference for flatter planes breaks ties
    return HARD * hard + soft + 1e-3 * (gx * gx + gy * gy)
  }
}
