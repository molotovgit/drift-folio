import { describe, expect, it } from 'vitest'
import { createInput } from '../../src/core/input'

function setup() {
  const target = new EventTarget()
  const input = createInput(target, () => [])
  const key = (type: 'keydown' | 'keyup', code: string) => {
    const e = new Event(type, { cancelable: true }) as Event & { code: string }
    Object.defineProperty(e, 'code', { value: code })
    target.dispatchEvent(e)
  }
  return { target, input, key }
}

describe('keyboard input', () => {
  it('W gives full throttle, S brake, Space handbrake', () => {
    const { input, key } = setup()
    key('keydown', 'KeyW')
    key('keydown', 'Space')
    const s = input.read(0.016)
    expect(s.throttle).toBe(1)
    expect(s.handbrake).toBe(true)
    key('keydown', 'KeyS')
    expect(input.read(0.016).brake).toBe(1)
  })

  it('steer ramps over 0.12 s instead of snapping, left is negative', () => {
    const { input, key } = setup()
    key('keydown', 'ArrowLeft')
    expect(input.read(0.06).steer).toBeCloseTo(-0.5, 2)
    expect(input.read(0.06).steer).toBeCloseTo(-1, 5)
    key('keyup', 'ArrowLeft')
    key('keydown', 'KeyD')
    expect(input.read(0.2).steer).toBe(1)
  })

  it('releasing all keys returns to idle', () => {
    const { input, key } = setup()
    key('keydown', 'KeyW')
    key('keydown', 'KeyD')
    input.read(0.2)
    key('keyup', 'KeyW')
    key('keyup', 'KeyD')
    const s = input.read(0.2)
    expect(s.throttle).toBe(0)
    expect(s.steer).toBe(0)
  })

  it('reset is a one-shot press', () => {
    const { input, key } = setup()
    key('keydown', 'KeyR')
    expect(input.read(0.016).reset).toBe(true)
    expect(input.read(0.016).reset).toBe(false)
  })

  it('window blur clears held keys', () => {
    const { target, input, key } = setup()
    key('keydown', 'KeyW')
    target.dispatchEvent(new Event('blur'))
    expect(input.read(0.016).throttle).toBe(0)
  })

  it('merges an analog touch source', () => {
    const { input } = setup()
    input.addSource({ read: () => ({ steer: 0.7, throttle: 1 }) })
    const s = input.read(0.016)
    expect(s.steer).toBe(0.7)
    expect(s.throttle).toBe(1)
  })
})
