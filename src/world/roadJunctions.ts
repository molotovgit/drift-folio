import type { Vec2, Vec3 } from '../core/math'
import { BLEND, JunctionPlane, MAX_GRADE, MIN_BLEND, type PlaneEnd } from './junctionPlane'
import { ROAD_WIDTH, type EdgeDef, type NodeDef } from './roadLayout'

export { BLEND, MAX_GRADE, MIN_BLEND }

/**
 * How roads meet at nodes. Every node gets one shared frame — a height plane —
 * that all roads touching it follow near the node, so overlapping ribbons at
 * forks agree on height and grade and nothing steps or kinks where they meet.
 */

/** Two road ends this nearly opposite (turn < 80°) form one continuous road through the node. */
const THROUGH_COS = Math.cos((100 * Math.PI) / 180)
/** a shared tangent may not tighten any curve below this (spec: hairpins ≥ 9 m, drivable sideways) */
export const MIN_CURVE_RADIUS = 9.5
/** each road keeps the node plane at least this far out from the node */
const MIN_HOLD = 6

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
 * tangent, see `phantoms`), each road's hold distance and the node's height
 * plane (see JunctionPlane).
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

  /** Measure how far each road must hold its node's plane, then fit each plane to the roads meeting there. */
  frames(lines: ReadonlyMap<string, Centreline>): Map<string, NodeFrame> {
    const out = new Map<string, NodeFrame>()
    for (const [id, ends] of this.ends) {
      const n = this.nodes.get(id)!
      const holds = new Map<string, number>()
      for (const e of ends) holds.set(key(e.edge.id, e.atStart), this.holdOf(e, ends, lines))
      const plane = new JunctionPlane(ends.map((e) => this.planeEnd(n, e, lines.get(e.edge.id)!, holds.get(key(e.edge.id, e.atStart))!)))
      out.set(id, new NodeFrame(id, { x: n.x, y: n.y, z: n.z }, plane.solve(), holds))
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

  /** One end as the plane fit sees it: its natural grade and its tangents over the hold and the blend after it. */
  private planeEnd(n: NodeDef, e: End, line: Centreline, hold: number): PlaneEnd {
    const far = this.nodes.get(e.atStart ? e.edge.to : e.edge.from)!
    const samples: PlaneEnd['samples'] = []
    const last = line.flat.length - 1
    for (let k = 0; k < last; k++) {
      const i = e.atStart ? k : last - k
      const j = e.atStart ? i + 1 : i - 1
      const s = e.atStart ? line.dist[i] : line.length - line.dist[i]
      if (s > hold + BLEND) break
      const u = Math.min(1, Math.max(0, (s - hold) / BLEND))
      samples.push({ t: unit(line.flat[j].x - line.flat[i].x, line.flat[j].y - line.flat[i].y), w: s <= hold ? 1 : 1 - u * u * (3 - 2 * u) })
    }
    return { samples, grade: (far.y - n.y) / line.length, length: line.length, hold, town: e.edge.route === 'town' }
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
