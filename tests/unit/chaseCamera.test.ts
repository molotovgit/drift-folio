import { describe, expect, it } from 'vitest'
import { chaseTarget } from '../../src/camera/chaseCamera'
import { toGround } from '../../src/core/math'

const deg = (r: number) => (r * 180) / Math.PI
const flatAngle = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.acos((a.x * b.x + a.z * b.z) / (Math.hypot(a.x, a.z) * Math.hypot(b.x, b.z)))

// car at origin pointing +Z
const heading = toGround({ x: 0, y: 0, z: 1 })

describe('chaseTarget', () => {
  it('at rest sits 6 m behind and 2.2 m above along the heading', () => {
    const t = chaseTarget({ pos: { x: 0, y: 0, z: 0 }, heading, vel: { x: 0, y: 0, z: 0 }, speed: 0 })
    expect(t.pos.x).toBeCloseTo(0)
    expect(t.pos.y).toBeCloseTo(2.2)
    expect(t.pos.z).toBeCloseTo(-6)
    expect(t.fov).toBeCloseTo(60)
  })

  it('mid-drift it looks mostly along the velocity, not the nose', () => {
    // travelling 30° to the left of the heading (left = +X) at 20 m/s
    const b = (30 * Math.PI) / 180
    const vel = { x: 20 * Math.sin(b), y: 0, z: 20 * Math.cos(b) }
    const t = chaseTarget({ pos: { x: 0, y: 0, z: 0 }, heading, vel, speed: 20 })
    const camDir = { x: t.look.x - t.pos.x, z: t.look.z - t.pos.z }
    const fromHeading = deg(flatAngle(camDir, { x: 0, z: 1 }))
    const fromVel = deg(flatAngle(camDir, vel))
    expect(fromHeading + fromVel).toBeCloseTo(30, 0) // lies between them
    expect(fromHeading / 30).toBeGreaterThanOrEqual(0.6)
  })

  it('FOV widens from 60° to 72° by 40 m/s', () => {
    const vel = { x: 0, y: 0, z: 40 }
    expect(chaseTarget({ pos: { x: 0, y: 0, z: 0 }, heading, vel, speed: 40 }).fov).toBeCloseTo(72)
    expect(chaseTarget({ pos: { x: 0, y: 0, z: 0 }, heading, vel: { x: 0, y: 0, z: 20 }, speed: 20 }).fov).toBeCloseTo(66)
  })

  it('top mode is 18 m up, pitched 55° down at the car', () => {
    const t = chaseTarget({ pos: { x: 0, y: 0, z: 0 }, heading, vel: { x: 0, y: 0, z: 0 }, speed: 0 }, 'top')
    expect(t.pos.y).toBeCloseTo(18)
    const horiz = Math.hypot(t.pos.x - t.look.x, t.pos.z - t.look.z)
    expect(deg(Math.atan2(t.pos.y - t.look.y, horiz))).toBeCloseTo(55, 1)
  })

  it('reversing keeps the camera behind the nose', () => {
    const t = chaseTarget({ pos: { x: 0, y: 0, z: 0 }, heading, vel: { x: 0, y: 0, z: -5 }, speed: 5 })
    expect(t.pos.z).toBeCloseTo(-6)
  })
})
