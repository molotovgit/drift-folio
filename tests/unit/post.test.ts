import { describe, expect, it } from 'vitest'
import { speedFx } from '../../src/render/speedFx'

describe('speed effects ramp (spec §5)', () => {
  it('is off below 15 m/s and full at 45 m/s', () => {
    expect(speedFx(0)).toBe(0)
    expect(speedFx(15)).toBe(0)
    expect(speedFx(30)).toBeCloseTo(0.5)
    expect(speedFx(45)).toBe(1)
    expect(speedFx(90)).toBe(1)
  })
})
