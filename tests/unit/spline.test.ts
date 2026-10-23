import { describe, expect, it } from 'vitest'
import { radii } from '../../src/world/spline'

/** Points along a circle of radius R, travelling so the centre is on the driver's left or right. */
function arc(turn: 'left' | 'right', R = 20, n = 20) {
  // start at origin heading +Z; left is +X, so a left turn's centre is at (+R, 0)
  const cx = turn === 'left' ? R : -R
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * (Math.PI / 2)
    return turn === 'left' ? { x: cx - R * Math.cos(a), y: R * Math.sin(a) } : { x: cx + R * Math.cos(a), y: R * Math.sin(a) }
  })
}

describe('radii sign convention (world: facing +Z, left is +X)', () => {
  it('is positive when turning toward the driver’s left (+X)', () => {
    const r = radii(arc('left'))
    expect(r[10]).toBeGreaterThan(0)
    expect(r[10]).toBeCloseTo(20, 0)
  })
  it('is negative when turning right', () => {
    expect(radii(arc('right'))[10]).toBeLessThan(0)
  })
  it('is Infinity on a straight', () => {
    expect(radii([0, 1, 2, 3, 4, 5, 6, 7].map((z) => ({ x: 0, y: z })))[3]).toBe(Infinity)
  })
})
