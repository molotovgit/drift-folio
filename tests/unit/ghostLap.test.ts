import * as THREE from 'three/webgpu'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeGhost, GhostRecorder } from '../../src/game/ghost'
import { GhostLap } from '../../src/game/ghostLap'
import { SafeStorage } from '../../src/util/storage'

/** A 60 s straight-line recording: the ghost's run time. */
function recording(): string {
  const rec = new GhostRecorder()
  rec.start()
  for (let t = 0; t <= 60; t += 0.05) rec.sample(t, { pos: { x: 0, y: 0, z: t * 20 }, yaw: 0 })
  return encodeGhost(rec.stop())
}

describe('GhostLap', () => {
  let lap: GhostLap
  let storage: SafeStorage

  beforeEach(async () => {
    // the recording loads; the car model does not (no GLB here), which leaves the ghost invisible but timed
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).endsWith('.json') ? new Response(recording()) : new Response('', { status: 404 }))))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    storage = new SafeStorage('test:', null)
    lap = new GhostLap(new THREE.Scene(), storage)
    await lap.load()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('a faster run that raced the ghost beats it, once', () => {
    expect(lap.duration).toBeCloseTo(60, 0)
    lap.start()
    expect(lap.finish(50)).toBe(true)
    expect(lap.beaten).toBe(true)
    expect(storage.get('ghost-beaten', false)).toBe(true)
    lap.start()
    expect(lap.finish(40)).toBe(false)
  })

  it('a slower run does not beat it', () => {
    lap.start()
    expect(lap.finish(70)).toBe(false)
    expect(lap.beaten).toBe(false)
  })

  it('finishing without starting the ghost does not beat it (route switched mid-run)', () => {
    expect(lap.finish(10)).toBe(false)
    expect(lap.beaten).toBe(false)
  })

  it('a cancelled race cannot be finished', () => {
    lap.start()
    lap.cancel()
    expect(lap.finish(10)).toBe(false)
  })
})
