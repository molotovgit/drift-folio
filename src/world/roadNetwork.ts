import type { Vec2, Vec3 } from '../core/math'
import { JunctionPlanner, MIN_CURVE_RADIUS, type Centreline, type NodeFrame } from './roadJunctions'
import { DESCENT_EDGES, EDGE_DEFS, NODE_DEFS, ROAD_WIDTH, SAMPLE_SPACING, type DescentRoute, type EdgeDef, type RoadRoute } from './roadLayout'
import { RoadProfile, type ProfileEnd } from './roadProfile'
import { catmullRom2D, radii } from './spline'

/** Surfaces meeting a road (lots, paved cuts, dirt channels) ramp to it over this many metres past its edge. */
export const MEET_RAMP = 12
/** curves tighter than this count as hairpins */
export const HAIRPIN_RADIUS = 25
/** a shared tangent at a node reshapes at most this much of each road end (its end spline segment) */
const END_REACH = 120
/** ...after staying level with the road this far past its edge */
const MEET_FLAT = 1.5

export interface RoadNode {
  id: string
  pos: Vec3
}

/** Nearest-road query result. */
export interface RoadHit {
  edge: RoadEdge
  index: number
  /** horizontal distance from the centreline, metres */
  dist: number
  point: Vec3
}

/** Horizontal centreline of an edge (shared tangents at through nodes, see JunctionPlanner). */
function centreline(def: EdgeDef, a: Vec3, b: Vec3, phantoms: { before?: Vec2; after?: Vec2 }): Centreline {
  const control: Vec2[] = [{ x: a.x, y: a.z }, ...def.ctrl.map(([x, z]) => ({ x, y: z })), { x: b.x, y: b.z }]
  const flat = catmullRom2D(control, SAMPLE_SPACING, phantoms.before, phantoms.after)
  const dist = [0]
  for (let i = 1; i < flat.length; i++) dist.push(dist[i - 1] + Math.hypot(flat[i].x - flat[i - 1].x, flat[i].y - flat[i - 1].y))
  return { flat, dist, length: dist[dist.length - 1] }
}

/** Unit horizontal direction at sample i of a polyline (central difference), as (x, z) in a Vec2. */
function chordTangent(pts: readonly { x: number; y: number }[], i: number): Vec2 {
  const a = pts[Math.max(0, i - 1)]
  const b = pts[Math.min(pts.length - 1, i + 1)]
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
}

/**
 * One road between two nodes: a centreline sampled every SAMPLE_SPACING metres.
 * Heights follow a RoadProfile: on the node's junction plane near each end
 * (with a matching cross-slope), a smooth constant grade in between.
 */
export class RoadEdge {
  readonly points: Vec3[]
  /** cumulative arc length at each sample */
  readonly dist: number[]
  readonly length: number
  /** signed horizontal turn radius per sample (+ = turning toward the driver's left, +X when facing +Z) */
  readonly radius: number[]
  /** cross-slope per sample: rise per metre toward the driver's left (non-zero only near junctions) */
  readonly bank: number[]
  readonly width = ROAD_WIDTH

  constructor(
    readonly id: string,
    readonly from: string,
    readonly to: string,
    readonly route: RoadRoute,
    line: Centreline,
    start: ProfileEnd,
    end: ProfileEnd,
  ) {
    const { flat } = line
    this.dist = line.dist
    this.length = line.length
    const profile = new RoadProfile(line, flat.map((_, i) => chordTangent(flat, i)), start, end)
    this.points = flat.map((p, i) => ({ x: p.x, y: profile.y[i], z: p.y }))
    this.bank = profile.bank
    this.radius = radii(flat)
  }

  /** Road surface height at sample i, `offset` metres to the driver's left of the centreline. */
  surfaceY(i: number, offset: number): number {
    return this.points[i].y + this.bank[i] * offset
  }

  /** Steepest grade between neighbouring samples (rise/run). */
  maxGrade(): number {
    let g = 0
    for (let i = 1; i < this.points.length; i++) g = Math.max(g, Math.abs(this.points[i].y - this.points[i - 1].y) / (this.dist[i] - this.dist[i - 1]))
    return g
  }

  /** Sample index at the apex of each hairpin (|radius| < maxRadius), one per corner. */
  hairpinApexes(maxRadius = HAIRPIN_RADIUS, minGap = 30): number[] {
    const out: number[] = []
    let i = 0
    while (i < this.points.length) {
      if (Math.abs(this.radius[i]) >= maxRadius) {
        i++
        continue
      }
      let best = i
      let j = i
      for (; j < this.points.length && Math.abs(this.radius[j]) < maxRadius; j++) {
        if (Math.abs(this.radius[j]) < Math.abs(this.radius[best])) best = j
      }
      if (!out.length || this.dist[best] - this.dist[out[out.length - 1]] > minGap) out.push(best)
      i = j
    }
    return out
  }

  /** Unit horizontal direction of travel at sample i, as (x, z) in a Vec2. */
  tangent(i: number): Vec2 {
    const a = this.points[Math.max(0, i - 1)]
    const b = this.points[Math.min(this.points.length - 1, i + 1)]
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1
    return { x: (b.x - a.x) / l, y: (b.z - a.z) / l }
  }

  /** Signed lateral offset of world (x, z) from sample i (+ = driver's left). */
  offsetOf(i: number, x: number, z: number): number {
    const p = this.points[i]
    const t = this.tangent(i)
    // left of travel: (tz, -tx)
    return (x - p.x) * t.y - (z - p.z) * t.x
  }

  /**
   * Surface height at world (x, z) near sample i: interpolated along the
   * centreline toward the neighbouring sample (samples are 2 m apart, so on a
   * 14 % grade the nearest sample alone can be 14 cm off) and continued
   * sideways with the cross-slope, lateral offset clamped to ±maxOffset.
   */
  surfaceNear(i: number, x: number, z: number, maxOffset = Infinity): number {
    const p = this.points[i]
    const t = this.tangent(i)
    const along = (x - p.x) * t.x + (z - p.z) * t.y
    const last = this.points.length - 1
    // the neighbour on the side of (x, z); past either end, extrapolate the end segment (the node plane continues)
    const ahead = along >= 0
    const j = ahead ? (i < last ? i + 1 : i - 1) : i > 0 ? i - 1 : i + 1
    const beyond = (ahead ? j < i : j > i) ? -1 : 1
    const k = Math.max(-3, Math.min(1, (beyond * Math.abs(along)) / Math.abs(this.dist[j] - this.dist[i])))
    const y = p.y + (this.points[j].y - p.y) * k
    const bank = this.bank[i] + (this.bank[j] - this.bank[i]) * k
    const off = Math.max(-maxOffset, Math.min(maxOffset, this.offsetOf(i, x, z)))
    return y + bank * off
  }
}

/** Spatial hash over all centreline samples for fast nearest-road queries. */
export class RoadIndex {
  // numeric cell keys: string keys dominated terrain build time
  private readonly grid = new Map<number, { edge: RoadEdge; index: number }[]>()

  constructor(
    edges: readonly RoadEdge[],
    private readonly cell = 16,
  ) {
    for (const edge of edges) {
      edge.points.forEach((p, index) => {
        const k = this.key(Math.floor(p.x / cell), Math.floor(p.z / cell))
        let bucket = this.grid.get(k)
        if (!bucket) this.grid.set(k, (bucket = []))
        bucket.push({ edge, index })
      })
    }
  }

  /** Nearest centreline sample within maxDist (horizontal), or null. */
  nearest(x: number, z: number, maxDist = 60): RoadHit | null {
    const r = Math.ceil(maxDist / this.cell)
    const cx = Math.floor(x / this.cell)
    const cz = Math.floor(z / this.cell)
    let best: RoadHit | null = null
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        for (const { edge, index } of this.grid.get(this.key(cx + dx, cz + dz)) ?? []) {
          const p = edge.points[index]
          const d = Math.hypot(p.x - x, p.z - z)
          if (d <= maxDist && (!best || d < best.dist)) best = { edge, index, dist: d, point: p }
        }
      }
    }
    return best
  }

  /** Closest sample of every edge within maxDist (one hit per edge), nearest first. */
  nearestPerEdge(x: number, z: number, maxDist: number): RoadHit[] {
    const r = Math.ceil(maxDist / this.cell)
    const cx = Math.floor(x / this.cell)
    const cz = Math.floor(z / this.cell)
    const best = new Map<RoadEdge, RoadHit>()
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        for (const { edge, index } of this.grid.get(this.key(cx + dx, cz + dz)) ?? []) {
          const p = edge.points[index]
          const d = Math.hypot(p.x - x, p.z - z)
          if (d > maxDist) continue
          const prev = best.get(edge)
          if (!prev || d < prev.dist) best.set(edge, { edge, index, dist: d, point: p })
        }
      }
    }
    return [...best.values()].sort((a, b) => a.dist - b.dist)
  }

  private key(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096)
  }
}

/** The mountain's roads (spec §6): nodes, edges and queries. Pure data, no rendering. */
export class RoadNetwork {
  readonly nodes: readonly RoadNode[]
  readonly edges: readonly RoadEdge[]
  readonly index: RoadIndex
  private readonly nodeById: Map<string, RoadNode>
  private readonly edgeById: Map<string, RoadEdge>
  private readonly frames: Map<string, NodeFrame>

  constructor(nodeDefs = NODE_DEFS, edgeDefs: readonly EdgeDef[] = EDGE_DEFS) {
    this.nodes = nodeDefs.map((n) => ({ id: n.id, pos: { x: n.x, y: n.y, z: n.z } }))
    this.nodeById = new Map(this.nodes.map((n) => [n.id, n]))
    // centrelines first (through roads share tangents), then node planes, then profiles
    const planner = new JunctionPlanner(nodeDefs, edgeDefs)
    const lines = this.centrelines(planner, edgeDefs)
    this.frames = planner.frames(lines)
    this.edges = edgeDefs.map((d) => {
      const start = this.junction(d.from)
      const end = this.junction(d.to)
      return new RoadEdge(d.id, d.from, d.to, d.route, lines.get(d.id)!, { frame: start, hold: start.hold(d.id, true) }, { frame: end, hold: end.hold(d.id, false) })
    })
    this.edgeById = new Map(this.edges.map((e) => [e.id, e]))
    this.index = new RoadIndex(this.edges)
  }

  /**
   * Every edge's centreline. Sharing a tangent through a node bends the end
   * segments; where that would turn a sweeper into a hairpin or tighten a
   * hairpin (below HAIRPIN_RADIUS or the road's own tightest curve, and never
   * below MIN_CURVE_RADIUS), that node keeps its corner instead — the junction
   * paving covers it.
   */
  private centrelines(planner: JunctionPlanner, edgeDefs: readonly EdgeDef[]): Map<string, Centreline> {
    const build = () => new Map(edgeDefs.map((d) => [d.id, centreline(d, this.node(d.from).pos, this.node(d.to).pos, planner.phantoms(d))]))
    // tightest curve within the end segment's reach of one end (only end segments change)
    const tightest = (line: Centreline, atStart: boolean) => {
      const r = radii(line.flat)
      const near = r.filter((_, i) => (atStart ? line.dist[i] : line.length - line.dist[i]) < END_REACH)
      return Math.min(...near.map(Math.abs))
    }
    const plain = new Map(edgeDefs.map((d) => [d.id, centreline(d, this.node(d.from).pos, this.node(d.to).pos, {})]))
    let lines = build()
    for (const d of edgeDefs) {
      for (const atStart of [false, true]) {
        const limit = Math.max(MIN_CURVE_RADIUS, Math.min(HAIRPIN_RADIUS, tightest(plain.get(d.id)!, atStart)) - 0.5)
        if (tightest(lines.get(d.id)!, atStart) < limit && planner.unpair(d.id, atStart)) lines = build()
      }
    }
    return lines
  }

  /** The shared height plane every road at a node follows near it. */
  junction(id: string): NodeFrame {
    const f = this.frames.get(id)
    if (!f) throw new Error(`unknown road node ${id}`)
    return f
  }

  node(id: string): RoadNode {
    const n = this.nodeById.get(id)
    if (!n) throw new Error(`unknown road node ${id}`)
    return n
  }

  edge(id: string): RoadEdge {
    const e = this.edgeById.get(id)
    if (!e) throw new Error(`unknown road edge ${id}`)
    return e
  }

  /**
   * Height for a paved surface (town lot, paved shortcut) that must meet the
   * roads without a step: the road's own surface over the asphalt, blending
   * smoothly to `ownY` over `ramp` metres starting just beyond the road edge.
   */
  meet(x: number, z: number, ownY: number, ramp = MEET_RAMP): number {
    const m = this.meeting(x, z, ramp)
    return m ? RoadNetwork.blendMeet(m.roadY, ownY, m.past / ramp) : ownY
  }

  /**
   * The road a paved surface at (x, z) has to meet, if one is within `ramp`:
   * its surface height there and how far (x, z) lies past the strip beside the
   * asphalt that stays level with it (0 on or next to the road).
   */
  meeting(x: number, z: number, ramp = MEET_RAMP): { roadY: number; past: number } | null {
    const half = ROAD_WIDTH / 2
    const hit = this.index.nearest(x, z, half + MEET_FLAT + ramp + 2)
    if (!hit) return null
    const { edge, index } = hit
    // across the road the lateral offset is the true distance; past an edge's end only the sample distance is
    const inside = index > 0 && index < edge.points.length - 1
    const d = inside ? Math.abs(edge.offsetOf(index, x, z)) : hit.dist
    // level with the road for MEET_FLAT past its edge, so a coarse mesh straddling the edge never pokes above the asphalt
    return { roadY: edge.surfaceNear(index, x, z, half), past: Math.max(0, d - half - MEET_FLAT) }
  }

  /** Smoothstep from the road's height (t = 0) to a surface's own height (t ≥ 1). */
  static blendMeet(roadY: number, ownY: number, t: number): number {
    const k = Math.min(1, Math.max(0, t))
    const w = k * k * (3 - 2 * k)
    return roadY * (1 - w) + ownY * w
  }

  /** Length of a themed descent, Fork 1 → town. */
  descentLength(route: DescentRoute): number {
    return DESCENT_EDGES[route].reduce((s, id) => s + this.edge(id).length, 0)
  }

  /** Node ids reachable from `start` following edges forward. */
  reachableFrom(start: string): Set<string> {
    const seen = new Set([start])
    const queue = [start]
    while (queue.length) {
      const id = queue.shift()!
      for (const e of this.edges) {
        if (e.from === id && !seen.has(e.to)) {
          seen.add(e.to)
          queue.push(e.to)
        }
      }
    }
    return seen
  }
}
