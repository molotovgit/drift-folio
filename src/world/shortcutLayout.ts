import type { Vec3 } from '../core/math'
import { valleyPond, valleyRiver } from './riverLayout'
import type { RoadNetwork } from './roadNetwork'
import { catmullRom2D } from './spline'

/**
 * Shortcut geometry (spec §6, plan M7) as data derived from the road network.
 * Dirt channels are polylines with a height profile the terrain is carved to.
 */
export interface Channel {
  id: string
  /** centreline with the surface height at each point */
  points: Vec3[]
  /** flat width of the channel floor, metres */
  width: number
  /** off-road driving allowed inside (no off-road crash) */
  dirt: boolean
}

/** Height of the nearest road sample to (x, z). */
const roadY = (roads: RoadNetwork, x: number, z: number) => roads.index.nearest(x, z, 40)?.point.y ?? 0

/** Densify a polyline to ~step metres, interpolating height. */
export function densify(points: Vec3[], step = 4): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step))
    for (let k = 0; k < n; k++) {
      const t = k / n
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
    }
  }
  out.push({ ...points[points.length - 1] })
  return out
}

/** S2: the dry riverbed — a straight dirt gully from Platform Ridge down to the town, east of the road. */
export function riverbed(roads: RoadNetwork): Channel {
  const start = { x: 82, z: 640 }
  const end = { x: 88, z: 822 }
  return {
    id: 'S2',
    dirt: true,
    width: 7,
    points: densify([
      { ...start, y: roadY(roads, start.x, start.z) },
      { x: 104, z: 700, y: roadY(roads, start.x, start.z) - 18 },
      { x: 106, z: 770, y: roadY(roads, end.x, end.z) + 14 },
      { ...end, y: roadY(roads, end.x, end.z) },
    ]),
  }
}

/** S3: the broken-rail chute — off the outside of the first Systems Drop hairpin, down into the cluster yard. */
export function brokenRailChute(roads: RoadNetwork): Channel {
  const top = { x: -168, z: 178 }
  const bottom = { x: -282, z: 352 }
  const topY = roadY(roads, -152, 172)
  const bottomY = roadY(roads, bottom.x, bottom.z)
  return {
    id: 'S3',
    dirt: true,
    width: 6,
    points: densify([
      { ...top, y: topY },
      { x: -205, z: 240, y: topY + (bottomY - topY) * 0.4 },
      { x: -250, z: 305, y: topY + (bottomY - topY) * 0.8 },
      { ...bottom, y: bottomY },
    ]),
  }
}

/** S4: the rest-stop cut — a paved chord across an Automation Pass loop, past the tea house. */
export function restStopCut(roads: RoadNetwork): Channel {
  const a = roads.edge('automation')
  const near = (x: number, z: number) => a.points.reduce((best, p) => (Math.hypot(p.x - x, p.z - z) < Math.hypot(best.x - x, best.z - z) ? p : best))
  const from = near(204, 352)
  const to = near(180, 556)
  // a smooth curve, not a polyline: a paved strip folds over itself on the inside of a sharp corner
  const flat = catmullRom2D([{ x: from.x, y: from.z }, { x: 224, y: 455 }, { x: to.x, y: to.z }], 4)
  const points = flat.map((p, i) => ({ x: p.x, y: from.y + ((to.y - from.y) * i) / (flat.length - 1), z: p.y }))
  return { id: 'S4', dirt: false, width: 7, points }
}

/** S6: the hidden trail behind the summit torii, climbing to a small peak. */
export const PEAK = { x: -78, z: -150, y: 26, r: 13 }
export function peakTrail(roads: RoadNetwork): Channel {
  const startY = roadY(roads, 0, -30)
  return {
    id: 'S6',
    dirt: true,
    width: 5,
    points: densify([
      { x: -6, z: -42, y: startY },
      { x: -34, z: -70, y: startY + 6 },
      { x: -64, z: -100, y: startY + 15 },
      { x: PEAK.x, z: PEAK.z + PEAK.r - 2, y: PEAK.y },
    ]),
  }
}

/** S5: the railway, a straight east-west line above the town crossing all three descents at grade. */
export const RAIL_Z = 778
export const RAIL_X = { from: -300, to: 330 }
export interface RailCrossing {
  edgeId: string
  x: number
  y: number
}

/** Where the railway crosses each road (x, height), found from the centrelines. */
export function railCrossings(roads: RoadNetwork): RailCrossing[] {
  const out: RailCrossing[] = []
  for (const e of roads.edges) {
    if (e.route === 'town' || e.route === 'return') continue
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1]
      const b = e.points[i]
      if ((a.z - RAIL_Z) * (b.z - RAIL_Z) > 0 || a.z === b.z) continue
      const t = (RAIL_Z - a.z) / (b.z - a.z)
      const x = a.x + (b.x - a.x) * t
      // a road crossing the line beyond the track's ends (another region) is no level crossing
      if (x < RAIL_X.from || x > RAIL_X.to) continue
      out.push({ edgeId: e.id, x, y: a.y + (b.y - a.y) * t })
    }
  }
  return out.sort((p, q) => p.x - q.x)
}

/** The railway bed: level with each road where it crosses, linear in between. */
export function railBed(roads: RoadNetwork): Channel {
  const cross = railCrossings(roads)
  const ys = cross.map((c) => c.y)
  const pts: Vec3[] = [
    { x: RAIL_X.from, y: ys[0], z: RAIL_Z },
    ...cross.map((c) => ({ x: c.x, y: c.y, z: RAIL_Z })),
    { x: RAIL_X.to, y: ys[ys.length - 1], z: RAIL_Z },
  ]
  return { id: 'S5', dirt: false, width: 7, points: densify(pts, 4) }
}

/** Every carved channel: the shortcuts, the railway bed and Lantern Valley's river and pond. */
export function allChannels(roads: RoadNetwork): Channel[] {
  return [riverbed(roads), brokenRailChute(roads), restStopCut(roads), peakTrail(roads), railBed(roads), valleyRiver(), valleyPond()]
}

/** Point-to-polyline distance and the fraction along it (0..1) of the closest point. */
export function channelDistance(c: Channel, x: number, z: number): { dist: number; frac: number } {
  let best = Infinity
  let frac = 0
  for (let i = 0; i < c.points.length - 1; i++) {
    const a = c.points[i]
    const b = c.points[i + 1]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)))
    const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z)
    if (d < best) {
      best = d
      frac = (i + t) / (c.points.length - 1)
    }
  }
  return { dist: best, frac }
}
