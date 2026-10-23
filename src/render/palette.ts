// Colour tokens from spec §5 (Inertial Drift dusk reference). Tuned at the style gate.
export const palette = {
  skyTop: '#2a1840',
  skyMid: '#5b2a6e',
  skyHorizon: '#c2407a',
  sunGlow: '#ff8a5c',
  foliageRed: '#b8322c',
  foliageOrange: '#e0572e',
  foliageAmber: '#f08a3c',
  pine: '#3b2f5a',
  road: '#5d4a72',
  roadLine: '#e8d9c0',
  terrain: '#6b3a5e',
  terrainShadow: '#4a3060',
  rail: '#cfc6d8',
  metalDark: '#5a5266',
  carTeal: '#2fb8a8',
  carShadow: '#3a3a7a',
  ink: '#1a1420',
  lampGlow: '#ffb35a',
  headlight: '#dff6ff',
  torii: '#c8321f',
  fog: '#7a3a78',
  hudText: '#fffbf6',
  hudAccent: '#ff5c8a',
  hudGold: '#ffc04d',
} as const

export type PaletteKey = keyof typeof palette

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`bad hex ${hex}`)
  const n = parseInt(m[1], 16)
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** WCAG relative-luminance contrast ratio. */
export function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const c = hexToRgb(h).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
