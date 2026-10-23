import type { Vec2, Vec3 } from '../core/math'
import { catmullRom2D, radii } from './spline'

/**
 * The mountain's roads (spec §6). Pure data + queries, no rendering.
 * 2D control points are world (x, z); heights are interpolated by arc length
 * between node heights. The car leaves the summit heading +Z (downhill).
 */
export type RoadRoute = 'summit' | 'automation' | 'platform' | 'systems' | 'systems-branch' | 'town' | 'return'

export interface RoadNode {
  id: string
  pos: Vec3
}

export interface RoadEdge {
  id: string
  from: string
  to: string
  route: RoadRoute
  width: number
  /** sampled centreline, world space */
  points: Vec3[]
  /** cumulative arc length per point */
  dist: number[]
  length: number
  /** signed horizontal turn radius per point (+ = left) */
  radius: number[]
}

export const ROAD_WIDTH = 8
export const SAMPLE_SPACING = 2

const N = (id: string, x: number, y: number, z: number): RoadNode => ({ id, pos: { x, y, z } })

export const NODES: RoadNode[] = [
  N('summit', 0, 0, -30),
  N('fork1', 0, -5, 110),
  N('fork2', 0, -32, 300),
  N('join2', 0, -62, 520),
  N('sysBranchOut', -100, -58, 345),
  N('sysBranchIn', -112, -76, 470),
  N('townA', 140, -116, 820),
  N('townP', 0, -117, 840),
  N('townS', -150, -116, 820),
  N('townW', 230, -118, 880),
]

const E = (id: string, from: string, to: string, route: RoadRoute, ctrl: [number, number][]) => ({ id, from, to, route, ctrl })

/** Control points exclude the endpoint nodes (added automatically). */
const EDGE_DEFS = [
  E('summit', 'summit', 'fork1', 'summit', [[0, 20], [0, 70]]),
  // west of the summit line (+X): long sweepers
  E('automation', 'fork1', 'townA', 'automation', [
    [40, 140], [130, 175], [200, 250], [205, 340], [150, 420], [140, 510], [200, 600], [215, 700], [180, 775],
  ]),
  E('platform', 'fork1', 'fork2', 'platform', [[10, 170], [-15, 230]]),
  E('platform-w', 'fork2', 'join2', 'platform', [[45, 340], [70, 420], [40, 490]]),
  E('platform-e', 'fork2', 'join2', 'platform', [[-45, 340], [-70, 420], [-40, 490]]),
  E('platform-down', 'join2', 'townP', 'platform', [[30, 580], [75, 650], [20, 710], [-40, 760], [-30, 805]]),
  // east (-X): tight hairpins down the steep face
  E('systems-a', 'fork1', 'sysBranchOut', 'systems', [
    [-40, 125], [-125, 145], [-152, 172], [-135, 202], [-82, 214], [-62, 245], [-90, 310],
  ]),
  E('systems-b', 'sysBranchOut', 'sysBranchIn', 'systems', [[-82, 378], [-96, 408], [-150, 424], [-160, 452]]),
  E('systems-c', 'sysBranchIn', 'townS', 'systems', [[-90, 540], [-120, 660], [-150, 770]]),
  // side branch: the cluster yard loop (C6/C7)
  E('cluster', 'sysBranchOut', 'sysBranchIn', 'systems-branch', [[-150, 350], [-290, 365], [-330, 415], [-290, 465], [-175, 478]]),
  // base town street
  E('town-ap', 'townA', 'townP', 'town', [[90, 835]]),
  E('town-ps', 'townP', 'townS', 'town', [[-80, 835]]),
  E('town-aw', 'townA', 'townW', 'town', [[190, 850]]),
  // return road: from the town's west end around the outside of the mountain back to the summit
  E('return', 'townW', 'summit', 'return', [
    [330, 860], [400, 760], [420, 620], [400, 480], [360, 340], [300, 210], [230, 100], [150, 10], [70, -50], [20, -60],
  ]),
]

function buildEdge(def: (typeof EDGE_DEFS)[number], nodes: Map<string, RoadNode>): RoadEdge {
  const a = nodes.get(def.from)!.pos
  const b = nodes.get(def.to)!.pos
  const ctrl: Vec2[] = [{ x: a.x, y: a.z }, ...def.ctrl.map(([x, z]) => ({ x, y: z })), { x: b.x, y: b.z }]
  const flat = catmullRom2D(ctrl, SAMPLE_SPACING)
  const dist: number[] = [0]
  for (let i = 1; i < flat.length; i++) dist.push(dist[i - 1] + Math.hypot(flat[i].x - flat[i - 1].x, flat[i].y - flat[i - 1].y))
  const length = dist[dist.length - 1]
  const points = flat.map((p, i) => ({ x: p.x, y: a.y + (b.y - a.y) * (dist[i] / length), z: p.y }))
  return { id: def.id, from: def.from, to: def.to, route: def.route, width: ROAD_WIDTH, points, dist, length, radius: radii(flat) }
}

export interface RoadNetwork {
  nodes: RoadNode[]
  edges: RoadEdge[]
  node(id: string): RoadNode
  edge(id: string): RoadEdge
}

export function buildRoadNetwork(): RoadNetwork {
  const nodes = new Map(NODES.map((n) => [n.id, n]))
  const edges = EDGE_DEFS.map((d) => buildEdge(d, nodes))
  const byId = new Map(edges.map((e) => [e.id, e]))
  return {
    nodes: NODES,
    edges,
    node: (id) => nodes.get(id)!,
    edge: (id) => byId.get(id)!,
  }
}

/** The descent a player drives for each themed route, Fork 1 → town (spec §6: 600–1000 m). */
export const DESCENT_EDGES: Record<'automation' | 'platform' | 'systems', string[]> = {
  automation: ['automation'],
  platform: ['platform', 'platform-w', 'platform-down'],
  systems: ['systems-a', 'systems-b', 'systems-c'],
}

export function descentLength(net: RoadNetwork, route: keyof typeof DESCENT_EDGES): number {
  return DESCENT_EDGES[route].reduce((s, id) => s + net.edge(id).length, 0)
}

export interface RoadHit {
  edge: RoadEdge
  index: number
  /** horizontal distance from the centreline */
  dist: number
  point: Vec3
}

/** Spatial hash over all centreline samples for nearest-road queries. */
export function createRoadIndex(net: RoadNetwork, cell = 16) {
  const grid = new Map<string, { e: RoadEdge; i: number }[]>()
  const key = (cx: number, cz: number) => `${cx},${cz}`
  for (const e of net.edges) {
    e.points.forEach((p, i) => {
      const k = key(Math.floor(p.x / cell), Math.floor(p.z / cell))
      let bucket = grid.get(k)
      if (!bucket) grid.set(k, (bucket = []))
      bucket.push({ e, i })
    })
  }
  return {
    /** nearest centreline sample within maxDist (horizontal), or null */
    nearest(x: number, z: number, maxDist = 60): RoadHit | null {
      const r = Math.ceil(maxDist / cell)
      const cx = Math.floor(x / cell)
      const cz = Math.floor(z / cell)
      let best: RoadHit | null = null
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const bucket = grid.get(key(cx + dx, cz + dz))
          if (!bucket) continue
          for (const { e, i } of bucket) {
            const p = e.points[i]
            const d = Math.hypot(p.x - x, p.z - z)
            if (d <= maxDist && (!best || d < best.dist)) best = { edge: e, index: i, dist: d, point: p }
          }
        }
      }
      return best
    },
  }
}

/** Indices of samples at the apex of each hairpin (|radius| < maxRadius), one per corner. */
export function hairpinApexes(e: RoadEdge, maxRadius = 25, minGap = 30): number[] {
  const out: number[] = []
  let i = 0
  while (i < e.points.length) {
    if (Math.abs(e.radius[i]) < maxRadius) {
      let j = i
      let best = i
      while (j < e.points.length && Math.abs(e.radius[j]) < maxRadius) {
        if (Math.abs(e.radius[j]) < Math.abs(e.radius[best])) best = j
        j++
      }
      if (!out.length || e.dist[best] - e.dist[out[out.length - 1]] > minGap) out.push(best)
      i = j
    } else i++
  }
  return out
}
