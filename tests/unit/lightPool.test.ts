import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', () => import('three'))
const { nearestAnchors } = await import('../../src/render/lightPool')

describe('nearestAnchors', () => {
  it('returns the n closest anchors, nearest first', () => {
    const anchors = [0, 0, 10, 0, 50, 0, 3, 4, -100, 0]
    expect(nearestAnchors(anchors, 2, 0, 3)).toEqual([0, 3, 1])
  })
  it('handles fewer anchors than lights', () => {
    expect(nearestAnchors([5, 5], 0, 0, 4)).toEqual([0])
    expect(nearestAnchors([], 0, 0, 4)).toEqual([])
  })
})
