import { describe, expect, it } from 'vitest'
import { PHYSICS_STEP } from '../../src/core/loop'
import { decodeGhost, encodeGhost, GHOST_HZ, GhostPlayer, GhostRecorder, handlingHash, scaleGhostTime, wrapAngle, type GhostRecording } from '../../src/game/ghost'

/** A 90 s synthetic descent sampled by the recorder from a 60 Hz loop: weaving, spinning, dropping. */
function syntheticRun(seconds = 90): GhostRecording {
  const rec = new GhostRecorder()
  rec.start()
  let x = 0
  let z = 0
  let yaw = 0
  for (let i = 0; i <= Math.round(seconds / PHYSICS_STEP); i++) {
    const t = i * PHYSICS_STEP
    const speed = 25 + 12 * Math.sin(t * 0.3)
    yaw += (0.9 * Math.sin(t * 0.7) + 0.4) * PHYSICS_STEP // keeps turning left, crosses ±π many times
    x += Math.sin(yaw) * speed * PHYSICS_STEP
    z += Math.cos(yaw) * speed * PHYSICS_STEP
    rec.sample(t, { pos: { x: x - 300, y: -0.13 * t * speed + Math.sin(t) * 0.3, z: z + 120 }, yaw })
  }
  return rec.stop()
}

describe('ghost recording', () => {
  it('samples a 60 Hz loop at 20 Hz', () => {
    const rec = syntheticRun(10)
    expect(rec.hz).toBe(GHOST_HZ)
    expect(rec.samples.length).toBeGreaterThanOrEqual(200)
    expect(rec.samples.length).toBeLessThanOrEqual(202)
    for (let i = 1; i < rec.samples.length; i++) expect(rec.samples[i].t - rec.samples[i - 1].t).toBeCloseTo(0.05, 6)
  })

  it('ignores samples outside start/stop', () => {
    const r = new GhostRecorder()
    r.sample(0, { pos: { x: 0, y: 0, z: 0 }, yaw: 0 })
    r.start()
    r.sample(0, { pos: { x: 1, y: 0, z: 0 }, yaw: 0 })
    const out = r.stop()
    r.sample(1, { pos: { x: 2, y: 0, z: 0 }, yaw: 0 })
    expect(out.samples.map((s) => s.x)).toEqual([1])
  })

  it('a 90 s run round-trips within 1 cm / 2e-3 rad and encodes under 60 KB', () => {
    const rec = syntheticRun(90)
    const text = encodeGhost(rec)
    expect(text.length).toBeLessThan(60 * 1024)
    const back = decodeGhost(text)
    expect(back.samples.length).toBe(rec.samples.length)
    rec.samples.forEach((a, i) => {
      const b = back.samples[i]
      expect(Math.abs(b.t - a.t)).toBeLessThan(1e-3)
      expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeLessThan(0.01)
      expect(Math.abs(wrapAngle(b.yaw - a.yaw))).toBeLessThan(2e-3)
    })
  })

  it('rejects a malformed payload', () => {
    expect(() => decodeGhost('{"v":99}')).toThrow()
    expect(() => decodeGhost('{"v":1,"hz":20,"t":[1],"x":[],"y":[],"z":[],"yaw":[]}')).toThrow()
  })

  it('scaling the timeline stretches every timestamp', () => {
    const rec = syntheticRun(5)
    const slow = scaleGhostTime(rec, 1.1)
    expect(slow.samples.at(-1)!.t).toBeCloseTo(rec.samples.at(-1)!.t * 1.1, 9)
    expect(slow.samples[3].x).toBe(rec.samples[3].x)
  })
})

describe('ghost playback', () => {
  const rec: GhostRecording = {
    hz: 20,
    samples: [
      { t: 0, x: 0, y: 0, z: 0, yaw: 3.0 },
      { t: 1, x: 10, y: -2, z: 4, yaw: -3.0 },
      { t: 2, x: 20, y: -4, z: 8, yaw: -2.0 },
    ],
  }

  it('interpolates position linearly and reports the duration', () => {
    const p = new GhostPlayer(rec)
    expect(p.duration).toBe(2)
    const at = p.poseAt(1.5)!
    expect(at.pos.x).toBeCloseTo(15)
    expect(at.pos.y).toBeCloseTo(-3)
    expect(at.pos.z).toBeCloseTo(6)
    expect(at.yaw).toBeCloseTo(-2.5)
  })

  it('interpolates yaw along the shortest arc across ±π', () => {
    const p = new GhostPlayer(rec)
    // 3.0 → -3.0 is 0.283 rad through π, not 6 rad back through 0
    const mid = p.poseAt(0.5)!.yaw
    expect(Math.abs(mid)).toBeGreaterThan(3.0)
  })

  it('holds the first pose before the start and is gone after the end', () => {
    const p = new GhostPlayer(rec)
    expect(p.poseAt(-1)!.pos.x).toBe(0)
    expect(p.poseAt(2)).not.toBeNull()
    expect(p.poseAt(2.01)).toBeNull()
  })

  it('handles random-access seeks as well as monotonic playback', () => {
    const p = new GhostPlayer(syntheticRun(20))
    const forward = [0.3, 0.31, 5.2, 5.25, 19.0].map((t) => p.poseAt(t)!.pos.x)
    const fresh = new GhostPlayer(syntheticRun(20))
    const seek = [19.0, 5.25, 5.2, 0.31, 0.3].map((t) => fresh.poseAt(t)!.pos.x).reverse()
    expect(seek).toEqual(forward)
  })

  it('refuses an empty recording', () => {
    expect(() => new GhostPlayer({ hz: 20, samples: [] })).toThrow()
  })
})

describe('handling hash', () => {
  it('ignores key order and changes with any value', () => {
    expect(handlingHash({ a: 1, b: { c: 2, d: 3 } })).toBe(handlingHash({ b: { d: 3, c: 2 }, a: 1 }))
    expect(handlingHash({ a: 1, b: { c: 2, d: 3 } })).not.toBe(handlingHash({ a: 1, b: { c: 2, d: 3.0001 } }))
  })
})
