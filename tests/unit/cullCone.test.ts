import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', () => import('three'))
const THREE = await import('three')
const { cullConeCos } = await import('../../src/world/instancedProps')

describe('cull cone', () => {
  it('covers the horizontal FOV of a wide phone screen plus margins', () => {
    const cam = new THREE.PerspectiveCamera(72, 2.17, 0.25, 2500)
    const halfH = Math.atan(Math.tan((72 / 2) * (Math.PI / 180)) * 2.17)
    expect(Math.acos(cullConeCos(cam))).toBeGreaterThan(halfH + 0.12)
  })
  it('is wider for wider aspect ratios', () => {
    expect(cullConeCos(new THREE.PerspectiveCamera(60, 2.2))).toBeLessThan(cullConeCos(new THREE.PerspectiveCamera(60, 1.3)))
  })
})
