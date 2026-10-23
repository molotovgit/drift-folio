import { describe, expect, it, vi } from 'vitest'

// skids.ts / smoke.ts import three/webgpu for their scene helpers; stub it so the pure parts load in Node.
vi.mock('three/webgpu', () => ({}))
vi.mock('three/tsl', () => ({}))

const { SkidBuffer } = await import('../../src/fx/skids')
const { smokeGate, smokePoolSize, SMOKE_RATE, SMOKE_MAX_LIFE } = await import('../../src/fx/smoke')

describe('SkidBuffer', () => {
  it('never exceeds capacity after 10,000 adds and wraps around', () => {
    const b = new SkidBuffer(4000)
    let last = -1
    for (let i = 0; i < 10_000; i++) last = b.add({ x: i, y: 0, z: 0 }, { x: i + 0.5, y: 0, z: 0 }, 0.1, 0.5)
    expect(b.count).toBe(4000)
    expect(last).toBe(9_999 % 4000)
    expect(b.positions.length).toBe(4000 * 12)
  })
  it('writes a quad of the requested half-width across the stroke', () => {
    const b = new SkidBuffer(4)
    b.add({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.1, 0.6)
    const p = b.positions
    expect(Math.abs(p[0] - p[3])).toBeCloseTo(0.2)
    expect(b.alphas[0]).toBeCloseTo(0.6)
  })
})

describe('smokeGate', () => {
  it('emits only while drifting or sliding hard', () => {
    expect(smokeGate(false, 0.3)).toBe(0)
    expect(smokeGate(true, 0.8)).toBeCloseTo(0.8)
    expect(smokeGate(false, 0.7)).toBeCloseTo(0.7)
  })
})

describe('smoke pool', () => {
  it('is big enough that two wheels at full rate never recycle a live puff', () => {
    expect(smokePoolSize(2)).toBeGreaterThanOrEqual(SMOKE_RATE * 2 * SMOKE_MAX_LIFE)
  })
})
