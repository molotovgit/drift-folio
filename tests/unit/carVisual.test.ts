import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', () => import('three'))
vi.mock('../../src/render/loadModel', () => ({}))

const { wheelSlot } = await import('../../src/vehicle/carVisual')

describe('wheelSlot', () => {
  it('maps model wheel positions to physics wheel order (left = +x, front = +z)', () => {
    expect(wheelSlot(0.73, 1.2)).toBe(0)
    expect(wheelSlot(-0.73, 1.2)).toBe(1)
    expect(wheelSlot(0.73, -1.2)).toBe(2)
    expect(wheelSlot(-0.73, -1.2)).toBe(3)
  })
})
