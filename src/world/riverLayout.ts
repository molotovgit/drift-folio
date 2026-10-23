import type { Vec3 } from '../core/math'
import type { Channel } from './shortcutLayout'
import { catmullRom2D } from './spline'

/**
 * Lantern Valley's river: a stream inside the loop of the paddy road and the
 * hairpin road, from a spring below the valley gate west to a pond beneath the
 * temple. It never crosses a road (it stays RIVER_ROAD_CLEARANCE from every
 * centreline), so no bridge has to carry traffic; footbridges cross it instead.
 * Carved into the terrain like the shortcut channels (allChannels).
 *
 * Bed heights (x, z, y) sit about 2 m under the valley floor the terrain
 * builds there (road-following base, hills halved inside the valley), falling
 * steadily west; the terrain carves its floor to them.
 */
const RIVER_PATH: readonly (readonly [number, number, number])[] = [
  [-405, 62, -17], [-428, 74, -20.5], [-452, 82, -23], [-478, 88, -25], [-500, 98, -27],
]
/** the pond the river ends in: centre, flat radius and floor height */
export const POND = { x: -516, z: 108, r: 11, y: -28.5 }
export const RIVER_WIDTH = 6
/** nothing of the river comes closer than this to a road centreline */
export const RIVER_ROAD_CLEARANCE = 30

/** The river: a smooth centreline, its bed height interpolated along it. */
export function valleyRiver(): Channel {
  const flat = catmullRom2D(
    RIVER_PATH.map(([x, z]) => ({ x, y: z })),
    4,
  )
  // heights follow the control points by share of length (the curve stays close to its control polygon)
  const fractions = cumulative(RIVER_PATH.map(([x, z]) => ({ x, y: z })))
  const along = cumulative(flat)
  const points: Vec3[] = flat.map((p, i) => {
    const f = along[i]
    let k = 0
    while (k < fractions.length - 2 && fractions[k + 1] < f) k++
    const t = Math.min(1, Math.max(0, (f - fractions[k]) / (fractions[k + 1] - fractions[k])))
    return { x: p.x, y: RIVER_PATH[k][2] + (RIVER_PATH[k + 1][2] - RIVER_PATH[k][2]) * t, z: p.y }
  })
  return { id: 'river', dirt: false, width: RIVER_WIDTH, points }
}

/** Cumulative length of a polyline at each point, as a share of its total (0..1). */
function cumulative(pts: readonly { x: number; y: number }[]): number[] {
  const out = [0]
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const total = out[out.length - 1] || 1
  return out.map((d) => d / total)
}

/** The pond: a short wide channel (its flat floor is a disc of radius POND.r). */
export function valleyPond(): Channel {
  return {
    id: 'pond',
    dirt: false,
    width: POND.r * 2,
    points: [
      { x: POND.x - 0.5, y: POND.y, z: POND.z },
      { x: POND.x + 0.5, y: POND.y, z: POND.z },
    ],
  }
}
