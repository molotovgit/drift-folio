import type { CardId } from '../content/projects'
import type { Vec3 } from '../core/math'
import { leftOf } from './roadMesh'
import type { RoadEdge, RoadNetwork } from './roadNetwork'

/**
 * Where each project corner sits (spec §6/§7). Each card is pinned to a road
 * edge near a preferred fraction of its length; the actual apex is the tightest
 * point within ±SEARCH metres (or the entry's own `search`) so the corner is a
 * real bend to drift.
 *
 * Three corners per biome: one on each mountain descent, three in Lantern
 * Valley and three in Neon Ward. Placements only: each card's content (and
 * the route it is filed under) is unchanged.
 */
export const CORNERS: Readonly<Record<CardId, { edge: string; at: number; search?: number }>> = {
  // the mountain pass: one per descent
  C1: { edge: 'platform', at: 0.55 },
  C3: { edge: 'automation', at: 0.3 },
  C4: { edge: 'systems-a', at: 0.25 },
  // Lantern Valley
  // (short region roads bend more than once: a narrow search keeps each card on its own bend)
  C8: { edge: 'valley-descent', at: 0.56, search: 30 },
  C9: { edge: 'valley-paddies', at: 0.71, search: 40 },
  C5: { edge: 'valley-hairpin', at: 0.7, search: 40 },
  // Neon Ward
  C2: { edge: 'city-alley', at: 0.23, search: 30 },
  C6: { edge: 'city-avenue', at: 0.51, search: 60 },
  C7: { edge: 'city-alley', at: 0.5, search: 40 },
}
const SEARCH = 120
/** the clipping point sits this far inside the centreline (toward the bend's centre) */
const CLIP_OFFSET = 2.6
/** the billboard stands this far outside the centreline, a little after the apex */
const BOARD_OFFSET = 12.5
const BOARD_AHEAD = 6
/** billboards turn to face the road this far before the apex, where the driver sees them */
const APPROACH = 40
/** drift within this radius of the clipping point to open the card */
export const APEX_RADIUS = 7

export interface CornerSpot {
  id: CardId
  edgeId: string
  /** apex sample index on the edge */
  index: number
  /** clipping point (inside of the bend at the apex) */
  clip: Vec3
  /** billboard foot position and yaw (the panel faces the road) */
  board: Vec3
  boardYaw: number
  /** +1 if the bend turns toward the driver's left, -1 right */
  turn: 1 | -1
}

/** +1 if the road bends left around sample i (from tangents), -1 if right. */
export function turnSideAt(e: RoadEdge, i: number): 1 | -1 {
  const a = e.tangent(Math.max(0, i - 6))
  const b = e.tangent(Math.min(e.points.length - 1, i + 6))
  const l = leftOf(a.x, a.y)
  return l.x * b.x + l.z * b.y > 0 ? 1 : -1
}

export function cornerSpots(roads: RoadNetwork): CornerSpot[] {
  return (Object.keys(CORNERS) as CardId[]).map((id) => {
    const { edge: edgeId, at, search = SEARCH } = CORNERS[id]
    const e = roads.edge(edgeId)
    const target = at * e.length
    // other cards on the same road shrink the window so two cards never pick the same bend
    const gaps = (Object.keys(CORNERS) as CardId[]).filter((o) => o !== id && CORNERS[o].edge === edgeId).map((o) => Math.abs(CORNERS[o].at * e.length - target))
    const window = Math.min(search, ...gaps.map((g) => g * 0.45))
    // tightest sample within the search window
    let index = Math.round(at * (e.points.length - 1))
    for (let i = 0; i < e.points.length; i++) {
      if (Math.abs(e.dist[i] - target) > window) continue
      if (Math.abs(e.radius[i]) < Math.abs(e.radius[index])) index = i
    }
    const turn = turnSideAt(e, index)
    const p = e.points[index]
    const t = e.tangent(index)
    const l = leftOf(t.x, t.y)
    // inside of the bend is the side it turns toward
    const clip = { x: p.x + l.x * CLIP_OFFSET * turn, y: p.y, z: p.z + l.z * CLIP_OFFSET * turn }
    const ahead = Math.min(e.points.length - 1, index + Math.round(BOARD_AHEAD / 2))
    const pa = e.points[ahead]
    const ta = e.tangent(ahead)
    const la = leftOf(ta.x, ta.y)
    const ox = la.x * BOARD_OFFSET * -turn
    const oz = la.z * BOARD_OFFSET * -turn
    // panel front is model +Z; face the approaching driver (a point APPROACH m before the apex)
    const bx = pa.x + ox
    const bz = pa.z + oz
    const approach = e.points[Math.max(0, index - Math.round(APPROACH / 2))]
    const boardYaw = Math.atan2(approach.x - bx, approach.z - bz)
    return { id, edgeId, index, clip, board: { x: bx, y: pa.y, z: bz }, boardYaw, turn }
  })
}
