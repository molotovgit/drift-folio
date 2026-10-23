import * as THREE from 'three/webgpu'
import { palette } from '../render/palette'
import { mulberry32 } from './dressing'
import { PADDY } from './templeLayout'
import { RegionMaterials } from './regionMaterials'
import { PlantBuilder, pose } from './vegetationModels'

/** Lantern Valley's own colours (dusk-dimmed, like the mountain's props). */
const C = {
  vermilion: palette.torii,
  vermilionDark: '#8e2418',
  roof: '#3b2e48',
  roofLight: '#55466a',
  wood: '#6e3a2c',
  plaster: '#d9cbb8',
  stone: palette.stone,
  stoneDark: '#6e6478',
  gold: '#d8a94a',
  ink: '#2a2230',
  earth: '#5a4436',
  bund: '#7a6a46',
  water: '#8fa6c8',
  rice: '#6f8a3a',
  riceTip: '#b0b85a',
} as const

const I = new THREE.Matrix4()
/** A box with its base at y0 (local), centred on (x, z). */
const box = (w: number, h: number, d: number, x = 0, y0 = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y0 + h / 2, z)
/** A hip roof: a four-sided pyramid with a w × d base at y0, rising h. */
const hipRoof = (w: number, d: number, h: number, y0: number) =>
  new THREE.ConeGeometry(Math.SQRT1_2, h, 4, 1)
    .rotateY(Math.PI / 4)
    .scale(w, 1, d)
    .translate(0, y0 + h / 2, 0)

/**
 * Procedural low-poly props for Lantern Valley, built like VegetationModels:
 * vertex-coloured, one mesh per material, origin at the base centre (the
 * paddy's at its water surface), sizes in metres, front facing +Z. Lit parts
 * (lantern fireboxes, the hall's paper screens) are a second mesh with a glow
 * material, so each instanced kind costs one or two draws.
 */
export class TempleModels {
  /** Stone lantern (tōrō), ~2.3 m: hex base, post, firebox with a warm light, hex roof. */
  static lantern(): THREE.Group {
    const s = new PlantBuilder()
    s.add(new THREE.CylinderGeometry(0.45, 0.5, 0.25, 6).translate(0, 0.125, 0), I, C.stoneDark, C.stone)
    s.add(new THREE.CylinderGeometry(0.14, 0.18, 0.9, 6).translate(0, 0.7, 0), I, C.stoneDark, C.stone)
    s.add(new THREE.CylinderGeometry(0.42, 0.36, 0.18, 6).translate(0, 1.24, 0), I, C.stone)
    // the firebox frame: four corner posts round the light
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]]) s.add(box(0.1, 0.45, 0.1, x, 1.33, z), I, C.stone)
    s.add(new THREE.ConeGeometry(0.62, 0.42, 6).translate(0, 1.99, 0), I, C.stoneDark, C.stone)
    s.add(new THREE.IcosahedronGeometry(0.1, 0).translate(0, 2.24, 0), I, C.stone)
    const glow = new PlantBuilder().add(box(0.32, 0.36, 0.32, 0, 1.37, 0), I, '#ffffff')
    return TempleModels.combine('temple_lantern', s, glow)
  }

  /** Small torii, ~3.4 m tall, 2.6 m wide, for the tunnels (the path runs along local Z). */
  static torii(): THREE.Group {
    const b = new PlantBuilder()
    for (const x of [-1.15, 1.15]) {
      b.add(new THREE.CylinderGeometry(0.12, 0.14, 3.2, 8).translate(x, 1.6, 0), I, C.vermilionDark, C.vermilion)
      b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.35, 8).translate(x, 0.17, 0), I, C.ink)
    }
    b.add(box(2.9, 0.16, 0.14, 0, 2.5), I, C.vermilion)
    b.add(box(3.2, 0.14, 0.24, 0, 2.95), I, C.vermilion)
    // the top beam, black, with its ends lifted a touch
    b.add(box(3.6, 0.2, 0.3, 0, 3.1), I, C.ink)
    for (const s of [-1, 1]) b.add(box(0.4, 0.12, 0.3, s * 1.75, 3.24), I, C.ink)
    return b.build('temple_torii', RegionMaterials.solid)
  }

  /** The crest gate over the valley road: two pairs of posts 13.6 m apart, beams, a hip roof (road along local Z). */
  static gate(): THREE.Group {
    const b = new PlantBuilder()
    for (const x of [-6.8, 6.8]) {
      for (const z of [-1.3, 1.3]) {
        b.add(new THREE.CylinderGeometry(0.3, 0.36, 7, 10).translate(x, 3.5, z), I, C.vermilionDark, C.vermilion)
        b.add(box(0.9, 0.5, 0.9, x, 0, z), I, C.stoneDark, C.stone)
      }
      b.add(box(0.4, 0.4, 3.2, x, 6.2), I, C.vermilion)
    }
    for (const z of [-1.3, 1.3]) b.add(box(15.2, 0.55, 0.45, 0, 5.6, z), I, C.vermilion)
    b.add(box(16.6, 0.35, 5, 0, 7.0), I, C.ink)
    b.add(hipRoof(15.5, 4.6, 2, 7.35), I, C.roof, C.roofLight)
    b.add(box(9, 0.35, 0.5, 0, 9.2), I, C.ink)
    // the gold name plaque between the beams (blank: no real lettering)
    b.add(box(1.6, 1.1, 0.12, 0, 6.3, 1.45), I, C.gold)
    return b.build('temple_gate', RegionMaterials.solid)
  }

  /** The temple hall, ~22 × 16 m and 12 m tall: stone platform, timber walls, a great hip roof, lit paper screens. */
  static hall(): THREE.Group {
    const b = new PlantBuilder()
    b.add(box(22, 1.2, 16), I, C.stoneDark, C.stone)
    b.add(box(6, 0.6, 2.2, 0, 0, 9), I, C.stone)
    b.add(box(16, 5, 10, 0, 1.2), I, C.wood, C.plaster)
    for (let i = 0; i < 6; i++) b.add(new THREE.CylinderGeometry(0.3, 0.34, 5, 8).translate(-7.5 + i * 3, 3.7, 6.3), I, C.vermilionDark, C.vermilion)
    b.add(box(17.5, 0.5, 13.5, 0, 6.2), I, C.vermilion)
    b.add(box(21.5, 0.4, 16, 0, 6.7), I, C.ink)
    b.add(hipRoof(21, 15, 5, 7.1), I, C.roof, C.roofLight)
    b.add(box(13, 0.6, 0.8, 0, 11.5), I, C.ink)
    for (const s of [-1, 1]) b.add(box(0.8, 1.1, 0.8, s * 6.6, 11.6), I, C.gold)
    // paper screens across the front and down the sides, lit from inside
    const glow = new PlantBuilder()
    glow.add(box(13, 2.8, 0.12, 0, 2.2, 5.04), I, '#ffffff')
    for (const s of [-1, 1]) glow.add(box(0.12, 2.4, 7, s * 8.04, 2.4), I, '#ffffff')
    return TempleModels.combine('temple_hall', b, glow)
  }

  /** Five-storey pagoda, ~21 m: shrinking timber storeys under wide dark eaves, a bronze spire. */
  static pagoda(): THREE.Group {
    const b = new PlantBuilder()
    b.add(box(9, 0.8, 9), I, C.stoneDark, C.stone)
    let y = 0.8
    for (let k = 0; k < 5; k++) {
      const s = 6 - k * 0.8
      const h = k === 0 ? 3 : 2.2
      b.add(box(s, h, s, 0, y), I, C.vermilionDark, C.vermilion)
      y += h
      b.add(box(s + 3.4, 0.3, s + 3.4, 0, y), I, C.ink)
      b.add(hipRoof(s + 3.2, s + 3.2, 0.9, y + 0.3), I, C.roof, C.roofLight)
      y += 0.9
    }
    b.add(new THREE.CylinderGeometry(0.1, 0.16, 4.2, 6).translate(0, y + 2.1, 0), I, C.gold)
    for (let k = 0; k < 5; k++) b.add(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 8).translate(0, y + 0.8 + k * 0.6, 0), I, C.gold)
    return b.build('temple_pagoda', RegionMaterials.solid)
  }

  /** Arched footbridge, 11 m long and 2.4 m wide, over the river (deck along local Z, ends at y = 0). */
  static bridge(): THREE.Group {
    const b = new PlantBuilder()
    const span = 11
    const rise = 1.3
    const n = 7
    const yAt = (z: number) => rise * (1 - (z / (span / 2)) ** 2)
    for (let k = 0; k < n; k++) {
      const z0 = -span / 2 + (k * span) / n
      const z1 = z0 + span / n
      const zc = (z0 + z1) / 2
      const slope = Math.atan2(yAt(z1) - yAt(z0), z1 - z0)
      b.add(box(2.4, 0.18, span / n + 0.08), pose(0, yAt(zc) - 0.09, zc, -slope), C.wood, '#8a5a3e')
      for (const x of [-1.15, 1.15]) {
        b.add(new THREE.CylinderGeometry(0.06, 0.07, 1, 6).translate(0, 0.5, 0), pose(x, yAt(z0), z0), C.vermilion)
        b.add(box(0.1, 0.1, span / n + 0.1), pose(x, yAt(zc) + 0.9, zc, -slope), C.vermilion)
      }
    }
    return b.build('temple_bridge', RegionMaterials.solid)
  }

  /**
   * One rice-paddy terrace: a level sheet of water inside a low earth bund,
   * planted in rows, on an earth skirt that reaches 3 m down so on sloping
   * ground it reads as a terrace step. Origin at the water surface; along
   * the road is local Z.
   */
  static paddy(): THREE.Group {
    const w = PADDY.across
    const d = PADDY.along
    const b = new PlantBuilder()
    b.add(box(w, 3, d, 0, -3.05), I, C.earth, '#6e5a3e')
    b.add(box(w - 0.5, 0.06, d - 0.5, 0, -0.06), I, C.water)
    for (const s of [-1, 1]) {
      b.add(box(w + 0.1, 0.22, 0.35, 0, -0.08, (s * (d - 0.2)) / 2), I, C.bund)
      b.add(box(0.35, 0.22, d, (s * (w - 0.2)) / 2, -0.08), I, C.bund)
    }
    // rows of rice: little two-blade tufts
    const rnd = mulberry32(17)
    for (let x = -w / 2 + 0.9; x <= w / 2 - 0.9; x += 1.3) {
      for (let z = -d / 2 + 0.9; z <= d / 2 - 0.9; z += 1.2) {
        for (let k = 0; k < 2; k++) {
          const a = rnd() * Math.PI * 2
          const blade = new THREE.ConeGeometry(0.05, 0.5 + rnd() * 0.15, 3, 1, true).translate(0, 0.27, 0)
          b.add(blade, pose(x + (rnd() - 0.5) * 0.2, -0.04, z + (rnd() - 0.5) * 0.2, 0, -a, -0.25), C.rice, C.riceTip)
        }
      }
    }
    return b.build('temple_paddy', RegionMaterials.solid)
  }

  /** A solid mesh and its lit parts as one template (two instanced draws). */
  private static combine(name: string, solid: PlantBuilder, glow: PlantBuilder): THREE.Group {
    const group = solid.build(name, RegionMaterials.solid)
    group.add(glow.build(`${name}_glow`, RegionMaterials.warmGlow).children[0])
    return group
  }
}
