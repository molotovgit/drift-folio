import type { Vec2, Vec3 } from '../core/math'
import { ROAD_WIDTH, type EdgeDef, type NodeDef } from './roadLayout'

/**
 * How roads meet at nodes. Every node gets one shared frame — a height plane —
 * that all roads touching it follow near the node, so overlapping ribbons at
 * forks agree on height and grade and nothing steps or kinks where they meet.
 */

/** Two road ends this nearly opposite (turn < 80°) form one continuous road through the node. */
const THROUGH_COS = Math.cos((100 * Math.PI) / 180)
/** a junction plane never tilts the through road sideways more than this (rise per metre) */
const MAX_CROSS = 0.06
/** nor along itself more than this */
const MAX_ALONG = 0.12
/** grade budget the profiles are fitted against (spec: max gradient 14 %) */
export const MAX_GRADE = 0.14
/** a shared tangent may not tighten any curve below this (spec: hairpins ≥ 9 m, drivable sideways) */
export const MIN_CURVE_RADIUS = 9.5
/** each road keeps the node plane at least this far out from the node */
const MIN_HOLD = 6
/** and blends from the plane to its own grade over at most this distance */
export const BLEND = 40

/** A centreline before heights: horizontal samples (x, y = world z) and their arc length. */
export interface Centreline {
  flat: Vec2[]
  dist: number[]
  length: number
}

/** One road end at a node. */
interface End {
  edge: EdgeDef
  atStart: boolean
}

const key = (edgeId: string, atStart: boolean) => `${edgeId}:${atStart ? 'start' : 'end'}`
const unit = (x: number, y: number): Vec2 => {
  const l = Math.hypot(x, y) || 1
  return { x: x / l, y: y / l }
}

/** Unit direction pointing away from the node along a centreline end. */
export function outward(line: Centreline, atStart: boolean): Vec2 {
  const f = line.flat
  const [a, b] = atStart ? [f[0], f[1]] : [f[f.length - 1], f[f.length - 2]]
  return unit(b.x - a.x, b.y - a.y)
}

/** The shared height plane at a node, plus how far each road holds it. */
export class NodeFrame {
  constructor(
    readonly id: string,
    readonly pos: Vec3,
    /** world gradient of the plane: rise per metre along +X and +Z */
    readonly grad: Vec2,
    private readonly holds: ReadonlyMap<string, number>,
  ) {}

  /** Plane height at world (x, z). */
  heightAt(x: number, z: number): number {
    return this.pos.y + this.grad.x * (x - this.pos.x) + this.grad.y * (z - this.pos.z)
  }

  /** Rise per metre of the plane along a horizontal direction (x, z). */
  slope(dx: number, dz: number): number {
    return this.grad.x * dx + this.grad.y * dz
  }

  /** Distance from the node along a road over which that road lies exactly on the plane. */
  hold(edgeId: string, atStart: boolean): number {
    return this.holds.get(key(edgeId, atStart)) ?? MIN_HOLD
  }
}

/**
 * Plans every node: which road ends continue each other (they then share a
 * tangent, see `phantoms`), the node's height plane and each road's hold distance.
 */
export class JunctionPlanner {
  private readonly nodes: ReadonlyMap<string, NodeDef>
  private readonly ends = new Map<string, End[]>()
  /** end key → the end it continues through its node */
  private readonly partner = new Map<string, End>()

  constructor(nodeDefs: readonly NodeDef[], edgeDefs: readonly EdgeDef[]) {
    this.nodes = new Map(nodeDefs.map((n) => [n.id, n]))
    for (const n of nodeDefs) this.ends.set(n.id, [])
    for (const e of edgeDefs) {
      this.ends.get(e.from)?.push({ edge: e, atStart: true })
      this.ends.get(e.to)?.push({ edge: e, atStart: false })
    }
    for (const list of this.ends.values()) this.pairThroughRoads(list)
  }

  /**
   * Phantom spline points for an edge: a paired end borrows its partner's
   * neighbouring control point, so both splines leave the node on one tangent.
   */
  phantoms(def: EdgeDef): { before?: Vec2; after?: Vec2 } {
    const p = (atStart: boolean) => {
      const other = this.partner.get(key(def.id, atStart))
      return other ? this.neighbour(other) : undefined
    }
    return { before: p(true), after: p(false) }
  }

  /** Undo the through pairing of one end (and its partner). Returns false if it was not paired. */
  unpair(edgeId: string, atStart: boolean): boolean {
    const k = key(edgeId, atStart)
    const other = this.partner.get(k)
    if (!other) return false
    this.partner.delete(k)
    this.partner.delete(key(other.edge.id, other.atStart))
    return true
  }

  /** Fit each node's plane to the roads meeting there and measure how far each must hold it. */
  frames(lines: ReadonlyMap<string, Centreline>): Map<string, NodeFrame> {
    const out = new Map<string, NodeFrame>()
    for (const [id, ends] of this.ends) {
      const n = this.nodes.get(id)!
      const grad = this.fitPlane(n, ends, lines)
      const holds = new Map<string, number>()
      for (const e of ends) holds.set(key(e.edge.id, e.atStart), this.holdOf(e, ends, lines))
      out.set(id, new NodeFrame(id, { x: n.x, y: n.y, z: n.z }, grad, holds))
    }
    return out
  }

  /** The control point next to the node along an end (an interior point, or the far node). */
  private neighbour(end: End): Vec2 {
    const { edge, atStart } = end
    if (edge.ctrl.length) {
      const [x, z] = atStart ? edge.ctrl[0] : edge.ctrl[edge.ctrl.length - 1]
      return { x, y: z }
    }
    const far = this.nodes.get(atStart ? edge.to : edge.from)!
    return { x: far.x, y: far.z }
  }

  /** Greedily pair the most opposite ends (by control polygon) into through roads. */
  private pairThroughRoads(ends: End[]): void {
    const at = (e: End) => this.nodes.get(e.atStart ? e.edge.from : e.edge.to)!
    const dir = (e: End) => {
      const n = at(e)
      const q = this.neighbour(e)
      return unit(q.x - n.x, q.y - n.z)
    }
    const pairs: { a: End; b: End; cos: number }[] = []
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        const da = dir(ends[i])
        const db = dir(ends[j])
        const cos = da.x * db.x + da.y * db.y
        if (cos < THROUGH_COS) pairs.push({ a: ends[i], b: ends[j], cos })
      }
    }
    pairs.sort((p, q) => p.cos - q.cos)
    for (const { a, b } of pairs) {
      const ka = key(a.edge.id, a.atStart)
      const kb = key(b.edge.id, b.atStart)
      if (this.partner.has(ka) || this.partner.has(kb)) continue
      this.partner.set(ka, b)
      this.partner.set(kb, a)
    }
  }

  /**
   * Plane gradient at a node. A through road fixes the grade along itself (a
   * weighted mean of its two halves); the other roads tilt it sideways, within
   * MAX_CROSS. Each road is weighted by how little grade it could give up: a
   * long, gentle road can absorb a mismatch, a short or steep one cannot.
   */
  private fitPlane(n: NodeDef, ends: End[], lines: ReadonlyMap<string, Centreline>): Vec2 {
    const info = ends.map((e) => {
      const line = lines.get(e.edge.id)!
      const far = this.nodes.get(e.atStart ? e.edge.to : e.edge.from)!
      const grade = (far.y - n.y) / line.length
      const room = Math.max(0.005, MAX_GRADE - Math.abs(grade)) * line.length
      return { end: e, out: outward(line, e.atStart), grade, w: 1 / room }
    })
    const through = info.find((i) => this.partner.has(key(i.end.edge.id, i.end.atStart)))
    if (!through) return this.leastSquares(info)
    const mate = info.find((i) => i.end === this.partner.get(key(through.end.edge.id, through.end.atStart)))!
    const d = through.out
    const p = { x: -d.y, y: d.x }
    // along the through road both halves vote; the partner's outward direction is ≈ −d
    const mateCos = Math.min(-0.2, mate.out.x * d.x + mate.out.y * d.y)
    const along = clampAbs((through.w * through.grade + (mate.w * mate.grade) / mateCos) / (through.w + mate.w), MAX_ALONG)
    let num = 0
    let den = 1e-4
    for (const i of info) {
      if (i === through || i === mate) continue
      const pd = i.out.x * d.x + i.out.y * d.y
      const pp = i.out.x * p.x + i.out.y * p.y
      num += i.w * pp * (i.grade - along * pd)
      den += i.w * pp * pp
    }
    const cross = clampAbs(num / den, MAX_CROSS)
    return { x: d.x * along + p.x * cross, y: d.y * along + p.y * cross }
  }

  /** Regularised least-squares plane through every end's natural grade (no through road). */
  private leastSquares(info: { out: Vec2; grade: number; w: number }[]): Vec2 {
    let a = 1e-3
    let b = 0
    let c = 1e-3
    let rx = 0
    let ry = 0
    for (const i of info) {
      a += i.w * i.out.x * i.out.x
      b += i.w * i.out.x * i.out.y
      c += i.w * i.out.y * i.out.y
      rx += i.w * i.grade * i.out.x
      ry += i.w * i.grade * i.out.y
    }
    const det = a * c - b * b
    const gx = (c * rx - b * ry) / det
    const gy = (a * ry - b * rx) / det
    const l = Math.hypot(gx, gy)
    const k = l > MAX_ALONG ? MAX_ALONG / l : 1
    return { x: gx * k, y: gy * k }
  }

  /** Distance along an end until its ribbon stops overlapping every other ribbon at the node. */
  private holdOf(end: End, ends: End[], lines: ReadonlyMap<string, Centreline>): number {
    const line = lines.get(end.edge.id)!
    const others = ends.filter((e) => e !== end).map((e) => JunctionPlanner.endPolyline(lines.get(e.edge.id)!, e.atStart, 60))
    const own = JunctionPlanner.endPolyline(line, end.atStart, 40)
    let last = 0
    for (const q of own) {
      if (others.some((poly) => distToPolyline(q.p, poly.map((o) => o.p)) < ROAD_WIDTH + 0.5)) last = q.s
    }
    return Math.max(MIN_HOLD, last + 1)
  }

  /** The first `reach` metres of a centreline from one end, with distance from that end. */
  private static endPolyline(line: Centreline, atStart: boolean, reach: number): { p: Vec2; s: number }[] {
    const out: { p: Vec2; s: number }[] = []
    const n = line.flat.length
    for (let k = 0; k < n; k++) {
      const i = atStart ? k : n - 1 - k
      const s = atStart ? line.dist[i] : line.length - line.dist[i]
      if (s > reach) break
      out.push({ p: line.flat[i], s })
    }
    return out
  }
}

const clampAbs = (v: number, m: number) => Math.max(-m, Math.min(m, v))

function distToPolyline(q: Vec2, poly: Vec2[]): number {
  let best = Infinity
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]
    const b = poly[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(a.x + dx * t - q.x, a.y + dy * t - q.y))
  }
  return best
}
