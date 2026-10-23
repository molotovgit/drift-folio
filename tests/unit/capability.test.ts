import { describe, expect, it } from 'vitest'
import { detectGpu } from '../../src/core/engine'

const fakeCanvas = (o: { webgl2: boolean }) =>
  ({ getContext: (k: string) => (k === 'webgl2' && o.webgl2 ? {} : null) }) as unknown as HTMLCanvasElement

describe('detectGpu', () => {
  it('prefers webgpu when an adapter is returned', async () => {
    const nav = { gpu: { requestAdapter: async () => ({}) } }
    expect(await detectGpu(nav, fakeCanvas({ webgl2: true }))).toBe('webgpu')
  })
  it('falls back to webgl2 when requestAdapter returns null', async () => {
    const nav = { gpu: { requestAdapter: async () => null } }
    expect(await detectGpu(nav, fakeCanvas({ webgl2: true }))).toBe('webgl2')
  })
  it('falls back to webgl2 when requestAdapter throws', async () => {
    const nav = { gpu: { requestAdapter: async () => { throw new Error('blocked') } } }
    expect(await detectGpu(nav, fakeCanvas({ webgl2: true }))).toBe('webgl2')
  })
  it('returns none when neither is available', async () => {
    expect(await detectGpu({}, fakeCanvas({ webgl2: false }))).toBe('none')
  })
})
