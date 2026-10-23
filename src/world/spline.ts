import type { Vec2 } from '../core/math'

/**
 * Centripetal Catmull-Rom through 2D control points (x, z), resampled at a
 * fixed arc-length spacing. Endpoints are included exactly.
 */
export function catmullRom2D(ctrl: Vec2[], spacing: number): Vec2[] {
  if (ctrl.length < 2) return ctrl.map((p) => ({ ...p }))
  const pts = [extrapolate(ctrl[1], ctrl[0]), ...ctrl, extrapolate(ctrl[ctrl.length - 2], ctrl[ctrl.length - 1])]
  const dense: Vec2[] = []
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]]
    const steps = Math.max(8, Math.ceil(dist(p1, p2) / (spacing / 4)))
    for (let s = 0; s < steps; s++) dense.push(segment(p0, p1, p2, p3, s / steps))
  }
  dense.push({ ...ctrl[ctrl.length - 1] })
  return resample(dense, spacing)
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y)
const extrapolate = (from: Vec2, to: Vec2): Vec2 => ({ x: to.x * 2 - from.x, y: to.y * 2 - from.y })

function segment(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const alpha = 0.5
  const tj = (a: Vec2, b: Vec2, ti: number) => ti + Math.max(1e-4, dist(a, b) ** alpha)
  const t0 = 0
  const t1 = tj(p0, p1, t0)
  const t2 = tj(p1, p2, t1)
  const t3 = tj(p2, p3, t2)
  const u = t1 + (t2 - t1) * t
  const lerp = (a: Vec2, b: Vec2, ta: number, tb: number): Vec2 => {
    const k = (u - ta) / (tb - ta)
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
  }
  const a1 = lerp(p0, p1, t0, t1)
  const a2 = lerp(p1, p2, t1, t2)
  const a3 = lerp(p2, p3, t2, t3)
  const b1 = lerp(a1, a2, t0, t2)
  const b2 = lerp(a2, a3, t1, t3)
  return lerp(b1, b2, t1, t2)
}

/** Resample a polyline at fixed arc-length spacing (last point kept exactly). */
export function resample(line: Vec2[], spacing: number): Vec2[] {
  const out: Vec2[] = [{ ...line[0] }]
  let carry = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    const seg = dist(a, b)
    let d = spacing - carry
    while (d <= seg) {
      const k = d / seg
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k })
      d += spacing
    }
    carry = seg - (d - spacing)
  }
  const last = line[line.length - 1]
  if (dist(out[out.length - 1], last) > spacing * 0.3) out.push({ ...last })
  else out[out.length - 1] = { ...last }
  return out
}

/** Signed curvature radius at each sample (inf on straights). */
export function radii(points: Vec2[]): number[] {
  return points.map((_, i) => {
    const a = points[Math.max(0, i - 3)]
    const b = points[i]
    const c = points[Math.min(points.length - 1, i + 3)]
    const ab = dist(a, b)
    const bc = dist(b, c)
    const ca = dist(c, a)
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    if (Math.abs(cross) < 1e-6) return Infinity
    return (ab * bc * ca) / (2 * cross) // sign: + = turning left (CCW)
  })
}
