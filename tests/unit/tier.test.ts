import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', () => ({ RenderPipeline: class {}, NeutralToneMapping: 0 }))
vi.mock('three/tsl', () => ({}))
vi.mock('three/addons/tsl/display/BloomNode.js', () => ({}))
const { parseTier } = await import('../../src/render/post')

describe('parseTier', () => {
  it('accepts only the known tiers', () => {
    expect(parseTier('high')).toBe('high')
    expect(parseTier('low')).toBe('low')
    expect(parseTier('foo')).toBeNull()
    expect(parseTier(null)).toBeNull()
  })
})
