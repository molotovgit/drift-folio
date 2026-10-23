import type { Vec2, Vec3 } from '../core/math'
import { DESCENT_EDGES, EDGE_DEFS, NODE_DEFS, ROAD_WIDTH, SAMPLE_SPACING, type DescentRoute, type EdgeDef, type RoadRoute } from './roadLayout'
import { catmullRom2D, radii } from './spline'

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

/**
 * One road between two nodes: a centreline sampled every SAMPLE_SPACING metres,
 * with heights interpolated by arc length between the node heights.
 */
export class RoadEdge {
  readonly points: Vec3[]
  /** cumulative arc length at each sample */
  readonly dist: number[]
  readonly length: number
  /** signed horizontal turn radius per sample (+ = turning left) */
  readonly radius: number[]
  readonly width = ROAD_WIDTH

  constructor(
    readonly id: string,
    readonly from: string,
    readonly to: string,
    readonly route: RoadRoute,
    a: Vec3,
    b: Vec3,
    ctrl: [number, number][],
  ) {
    const control: Vec2[] = [{ x: a.x, y: a.z }, ...ctrl.map(([x, z]) => ({ x, y: z })), { x: b.x, y: b.z }]
    const flat = catmullRom2D(control, SAMPLE_SPACING)
    this.dist = [0]
    for (let i = 1; i < flat.length; i++) this.dist.push(this.dist[i - 1] + Math.hypot(flat[i].x - flat[i - 1].x, flat[i].y - flat[i - 1].y))
    this.length = this.dist[this.dist.length - 1]
    this.points = flat.map((p, i) => ({ x: p.x, y: a.y + (b.y - a.y) * (this.dist[i] / this.length), z: p.y }))
    this.radius = radii(flat)
  }

  /** Steepest grade between neighbouring samples (rise/run). */
  maxGrade(): number {
    let g = 0
    for (let i = 1; i < this.points.length; i++) g = Math.max(g, Math.abs(this.points[i].y - this.points[i - 1].y) / (this.dist[i] - this.dist[i - 1]))
    return g
  }

  /** Sample index at the apex of each hairpin (|radius| < maxRadius), one per corner. */
  hairpinApexes(maxRadius = 25, minGap = 30): number[] {
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
}

/** Spatial hash over all centreline samples for fast nearest-road queries. */
export class RoadIndex {
  private readonly grid = new Map<string, { edge: RoadEdge; index: number }[]>()

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

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`
  }
}

/** The mountain's roads (spec §6): nodes, edges and queries. Pure data, no rendering. */
export class RoadNetwork {
  readonly nodes: readonly RoadNode[]
  readonly edges: readonly RoadEdge[]
  readonly index: RoadIndex
  private readonly nodeById: Map<string, RoadNode>
  private readonly edgeById: Map<string, RoadEdge>

  constructor(nodeDefs = NODE_DEFS, edgeDefs: readonly EdgeDef[] = EDGE_DEFS) {
    this.nodes = nodeDefs.map((n) => ({ id: n.id, pos: { x: n.x, y: n.y, z: n.z } }))
    this.nodeById = new Map(this.nodes.map((n) => [n.id, n]))
    this.edges = edgeDefs.map((d) => new RoadEdge(d.id, d.from, d.to, d.route, this.node(d.from).pos, this.node(d.to).pos, d.ctrl))
    this.edgeById = new Map(this.edges.map((e) => [e.id, e]))
    this.index = new RoadIndex(this.edges)
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
