import type { Vec2 } from '../core/math'
import { BLEND, MAX_GRADE, MIN_BLEND, type Centreline, type NodeFrame } from './roadJunctions'

/** the two holds together never take more than this share of a road, leaving room to blend between them */
const MAX_HOLD_SHARE = 0.6

const smoothstep = (e0: number, e1: number, x: number) => {
  if (e1 <= e0) return x < e0 ? 0 : 1
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** One end of a road: its node frame and how far from the node it lies exactly on the plane. */
export interface ProfileEnd {
  frame: NodeFrame
  hold: number
}

/**
 * Vertical profile of one road: centreline heights plus a cross-slope per sample.
 *
 * Near each end the road lies exactly on its node's plane (heights and
 * cross-slope), so every road at a junction shares one surface. It then blends
 * smoothly (smoothstep weights, so the grade is continuous) into a constant
 * middle grade chosen so the road lands exactly on the far node. Blends shorten
 * if the middle grade would exceed MAX_GRADE; on a road too short for both
 * holds, the holds shrink (MAX_HOLD_SHARE).
 */
export class RoadProfile {
  /** centreline height per sample */
  readonly y: number[]
  /** cross-slope per sample: rise per metre toward the driver's left */
  readonly bank: number[]

  constructor(line: Centreline, tangents: readonly Vec2[], start: ProfileEnd, end: ProfileEnd) {
    const k = Math.min(1, (MAX_HOLD_SHARE * line.length) / (start.hold + end.hold))
    start = { ...start, hold: start.hold * k }
    end = { ...end, hold: end.hold * k }
    let blend = BLEND
    let fit = RoadProfile.solve(line, tangents, start, end, blend)
    while (fit.maxGrade > MAX_GRADE && blend > MIN_BLEND) {
      blend = Math.max(MIN_BLEND, blend * 0.8)
      fit = RoadProfile.solve(line, tangents, start, end, blend)
    }
    this.y = fit.y
    this.bank = fit.bank
  }

  private static solve(line: Centreline, tangents: readonly Vec2[], start: ProfileEnd, end: ProfileEnd, blend: number) {
    const { flat, dist, length } = line
    const n = flat.length
    // keep the two holds + blends inside the road
    const room = Math.max(0, length - start.hold - end.hold)
    const t = Math.min(blend, room / 2.5)
    const a = (s: number) => 1 - smoothstep(start.hold, start.hold + t, s)
    const b = (s: number) => smoothstep(length - end.hold - t, length - end.hold, s)
    const g0 = start.frame.grad
    const g1 = end.frame.grad
    // rise of segment i = plane rise (weights a, b) + middle grade m × the rest of the weight
    const fixed: number[] = [0]
    const free: number[] = [0]
    for (let i = 1; i < n; i++) {
      const s = (dist[i] + dist[i - 1]) / 2
      const dx = flat[i].x - flat[i - 1].x
      const dz = flat[i].y - flat[i - 1].y
      const wa = a(s)
      const wb = b(s)
      fixed.push(wa * (g0.x * dx + g0.y * dz) + wb * (g1.x * dx + g1.y * dz))
      free.push(Math.max(0, 1 - wa - wb) * (dist[i] - dist[i - 1]))
    }
    const sumFixed = fixed.reduce((p, q) => p + q, 0)
    const sumFree = free.reduce((p, q) => p + q, 0)
    const m = sumFree > 1e-6 ? (end.frame.pos.y - start.frame.pos.y - sumFixed) / sumFree : 0
    const y = [start.frame.pos.y]
    let maxGrade = 0
    for (let i = 1; i < n; i++) {
      const rise = fixed[i] + m * free[i]
      y.push(y[i - 1] + rise)
      maxGrade = Math.max(maxGrade, Math.abs(rise) / (dist[i] - dist[i - 1]))
    }
    // land exactly on the far node (float drift only)
    y[n - 1] = end.frame.pos.y
    const bank = tangents.map((tg, i) => {
      const wa = a(dist[i])
      const wb = b(dist[i])
      // left of travel (facing +Z, left is +X): (tz, -tx)
      const lx = tg.y
      const lz = -tg.x
      return wa * (g0.x * lx + g0.y * lz) + wb * (g1.x * lx + g1.y * lz)
    })
    return { y, bank, maxGrade }
  }
}
