import { describe, expect, it } from 'vitest'
import { contrast, hexToRgb, palette } from '../../src/render/palette'

describe('palette', () => {
  it('has the spec §5 anchors', () => {
    expect(palette.skyHorizon).toBe('#c2407a')
    expect(palette.skyMid).toBe('#5b2a6e')
    expect(palette.skyTop).toBe('#2a1840')
    expect(palette.carTeal).toBe('#2fb8a8')
    expect(palette.lampGlow).toBe('#ffb35a')
  })
  it('every token parses as hex', () => {
    for (const v of Object.values(palette)) expect(() => hexToRgb(v)).not.toThrow()
  })
  it('HUD text reads at 4.5:1 on every sky band, including the horizon', () => {
    for (const bg of [palette.skyTop, palette.skyMid, palette.skyHorizon]) expect(contrast(palette.hudText, bg)).toBeGreaterThanOrEqual(4.5)
  })
})
