import * as THREE from 'three/webgpu'
import { mulberry32 } from './dressing'
import { BAND_CELLS, BLADE_CELLS } from './cityLayout'

/** Neon tube colours (dusk-bright: they bloom). */
export const NEON = ['#ff4fa3', '#3ff0ff', '#ffd23f', '#5cff8a', '#b26bff', '#ff8a3d', '#ff3b4f', '#bfe6ff'] as const

/**
 * Made-up shop names for the band signs: original, no real brands. Latin only;
 * the "kana" on every sign are invented glyph shapes (see `glyph`), not text.
 */
export const FAKE_BRANDS = ['HOSHIYA', 'KUMODO', 'NEONOKI', 'TSUKIBA', 'RAMEN 88', 'MIDORIKAN', 'SORA CAFE', 'KAZEYA'] as const

/** Facade tile: 8 windows × 6 floors over a 4-shop ground floor (see CityModels for the UV layout). */
export const FACADE = { size: 512, cols: 8, floors: 6, shopRow: 128, shops: 4 } as const
/** Sign atlas: BLADE_CELLS tall blade cells across the top half, BAND_CELLS wide bands (2 × 4) in the bottom half. */
export const SIGN_ATLAS = { size: 1024 } as const

/**
 * Canvas textures for Neon Ward: building facades (a colour map whose frame
 * the vertex tint colours, plus a matching emissive map where only lit
 * windows and shopfronts glow) and the neon sign atlas. Seeded, so every
 * load paints the same city. Built in the browser only (needs a 2D canvas).
 */
export class NeonAtlas {
  /** [colour map, emissive map] for building facades. */
  static facade(): [THREE.CanvasTexture, THREE.CanvasTexture] {
    const rnd = mulberry32(611)
    const { size, cols, floors, shopRow, shops } = FACADE
    const [color, gc] = NeonAtlas.canvas(size, size)
    const [glow, gg] = NeonAtlas.canvas(size, size)
    // frame: light grey so the per-building vertex tint shows; nothing glows
    gc.fillStyle = '#9a92a6'
    gc.fillRect(0, 0, size, size)
    gg.fillStyle = '#000000'
    gg.fillRect(0, 0, size, size)
    const cw = size / cols
    const ch = (size - shopRow) / floors
    for (let f = 0; f < floors; f++) {
      // a slab line between floors
      gc.fillStyle = '#7a7288'
      gc.fillRect(0, f * ch + ch - 6, size, 6)
      for (let c = 0; c < cols; c++) {
        const x = c * cw + 9
        const y = f * ch + 10
        const roll = rnd()
        const lit = roll < 0.42 ? (roll < 0.1 ? '#ff9fd0' : roll < 0.22 ? '#a8e8ff' : '#ffd89a') : null
        gc.fillStyle = lit ?? '#2a2440'
        gc.fillRect(x, y, cw - 18, ch - 24)
        if (lit) {
          gg.fillStyle = lit
          gg.fillRect(x, y, cw - 18, ch - 24)
          // a blind half-drawn in some lit windows
          if (rnd() < 0.4) {
            gc.fillStyle = gg.fillStyle = '#3a3048'
            gc.fillRect(x, y, cw - 18, (ch - 24) * 0.35)
            gg.fillRect(x, y, cw - 18, (ch - 24) * 0.35)
          }
        }
      }
    }
    // the ground floor: shopfronts, lit or shuttered
    const sw = size / shops
    for (let s = 0; s < shops; s++) {
      const x = s * sw + 8
      const y = size - shopRow + 14
      const lit = s % 3 !== 2
      const tone = NEON[Math.floor(rnd() * NEON.length)]
      gc.fillStyle = lit ? '#ffe9c8' : '#4a4458'
      gc.fillRect(x, y, sw - 16, shopRow - 14)
      if (lit) {
        gg.fillStyle = '#ffd9a0'
        gg.fillRect(x, y + 26, sw - 16, shopRow - 40)
        // a coloured awning strip over the window
        gc.fillStyle = gg.fillStyle = tone
        gc.fillRect(x, y, sw - 16, 20)
        gg.fillRect(x, y, sw - 16, 20)
      } else {
        // shutter slats
        gc.fillStyle = '#3a3446'
        for (let k = y + 6; k < size; k += 10) gc.fillRect(x, k, sw - 16, 4)
      }
    }
    return [NeonAtlas.texture(color, true), NeonAtlas.texture(glow, true)]
  }

  /** The neon sign atlas (used as both colour and emissive map). */
  static signs(): THREE.CanvasTexture {
    const rnd = mulberry32(777)
    const n = SIGN_ATLAS.size
    const [c, g] = NeonAtlas.canvas(n, n)
    g.fillStyle = '#0d0814'
    g.fillRect(0, 0, n, n)
    const bw = n / BLADE_CELLS
    for (let k = 0; k < BLADE_CELLS; k++) {
      const tone = NEON[k % NEON.length]
      NeonAtlas.panel(g, k * bw, 0, bw, n / 2, tone)
      // three or four invented glyphs stacked down the blade
      const count = 3 + (k % 2)
      const box = Math.min(bw - 36, (n / 2 - 60) / count)
      for (let i = 0; i < count; i++) NeonAtlas.glyph(g, k * bw + (bw - box) / 2, 30 + i * ((n / 2 - 60) / count), box, tone, rnd)
    }
    const cw = n / 2
    const chh = n / 2 / (BAND_CELLS / 2)
    for (let k = 0; k < BAND_CELLS; k++) {
      const x = (k % 2) * cw
      const y = n / 2 + Math.floor(k / 2) * chh
      const tone = NEON[(k * 3 + 1) % NEON.length]
      const accent = NEON[(k * 5 + 4) % NEON.length]
      NeonAtlas.panel(g, x, y, cw, chh, tone)
      // a glyph badge, then the made-up brand name
      NeonAtlas.glyph(g, x + 22, y + 22, chh - 44, accent, rnd)
      g.save()
      g.font = `italic 800 ${Math.round(chh * 0.42)}px "Barlow Condensed", "Arial Narrow", sans-serif`
      g.textBaseline = 'middle'
      g.fillStyle = '#ffffff'
      g.shadowColor = tone
      g.shadowBlur = 18
      g.fillText(FAKE_BRANDS[k % FAKE_BRANDS.length], x + chh + 10, y + chh / 2 + 2, cw - chh - 30)
      g.restore()
    }
    return NeonAtlas.texture(c, false)
  }

  /** A dark sign panel with a glowing tube border. */
  private static panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tone: string): void {
    g.fillStyle = '#160c22'
    g.fillRect(x + 4, y + 4, w - 8, h - 8)
    g.save()
    g.strokeStyle = tone
    g.lineWidth = 6
    g.shadowColor = tone
    g.shadowBlur = 14
    g.strokeRect(x + 12, y + 12, w - 24, h - 24)
    g.restore()
  }

  /**
   * An invented kana-like glyph: two to four brush strokes (bars, hooks,
   * slants, a dot) inside a square, drawn as glowing tubes. Random shapes from
   * a seeded stream, so they read as lettering without being any real script.
   */
  private static glyph(g: CanvasRenderingContext2D, x: number, y: number, s: number, tone: string, rnd: () => number): void {
    g.save()
    g.strokeStyle = '#ffffff'
    g.lineWidth = Math.max(4, s * 0.09)
    g.lineCap = 'round'
    g.shadowColor = tone
    g.shadowBlur = 16
    const p = (u: number, v: number): [number, number] => [x + s * (0.15 + u * 0.7), y + s * (0.15 + v * 0.7)]
    const strokes = 2 + Math.floor(rnd() * 3)
    g.beginPath()
    for (let i = 0; i < strokes; i++) {
      const kind = Math.floor(rnd() * 5)
      const a = rnd()
      const b = rnd()
      if (kind === 0) {
        // a bar across
        g.moveTo(...p(0.05, a))
        g.lineTo(...p(0.95, a * 0.8 + 0.1))
      } else if (kind === 1) {
        // a stroke down with a hook
        g.moveTo(...p(a, 0.05))
        g.lineTo(...p(a, 0.85))
        g.lineTo(...p(a - 0.2, 0.75))
      } else if (kind === 2) {
        // a long slant
        g.moveTo(...p(0.85, 0.1 + b * 0.2))
        g.quadraticCurveTo(...p(0.5, 0.5), ...p(0.1, 0.9))
      } else if (kind === 3) {
        // a bent stroke
        g.moveTo(...p(0.15, 0.2 + a * 0.3))
        g.lineTo(...p(0.8, 0.2 + a * 0.3))
        g.lineTo(...p(0.55, 0.95))
      } else {
        // a short tick
        g.moveTo(...p(0.6 + b * 0.25, 0.05))
        g.lineTo(...p(0.75 + b * 0.2, 0.3))
      }
    }
    g.stroke()
    g.restore()
  }

  private static canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return [c, c.getContext('2d')!]
  }

  private static texture(c: HTMLCanvasElement, repeat: boolean): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    if (repeat) tex.wrapS = THREE.RepeatWrapping
    return tex
  }
}
