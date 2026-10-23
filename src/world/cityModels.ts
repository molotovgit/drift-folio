import * as THREE from 'three/webgpu'
import { ToonMaterials } from '../render/toon'
import { BAND_CELLS, BLADE_CELLS, OVERPASS, PILLAR, type Building, type CityLayout, type NeonSign } from './cityLayout'
import { FACADE } from './neonAtlas'
import { BoxWriter, RegionMaterials } from './regionMaterials'
import type { TerrainHeights } from './terrain'
import { PlantBuilder } from './vegetationModels'

/** Facade tints the window texture is multiplied by (concrete, sandstone, teal-grey, mauve). */
const FACADE_TINTS = ['#8e86a8', '#a49a8c', '#7f98a0', '#9a7f8f', '#6f6a86', '#b0a6b8'] as const
/** the facade tile covers this many metres across (8 windows) and up (6 floors) */
const TILE_W = 24
const TILE_H = 21
/** the ground floor band (shopfronts) is this tall on street blocks */
const SHOP_H = 4
/** UV of a plain frame texel (roofs, sign edges) */
const FRAME_UV: [number, number, number, number] = [4 / FACADE.size, 1 - 4 / FACADE.size, 4 / FACADE.size, 1 - 4 / FACADE.size]
const DARK_SIGN_UV: [number, number, number, number] = [1 / 1024, 1 - 1 / 1024, 1 / 1024, 1 - 1 / 1024]

/** Frame at (x, y, z) turned by yaw about +Y. */
const frame = (x: number, y: number, z: number, yaw = 0) => new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z)

/**
 * Neon Ward's meshes. The buildings, signs and expressway are static and
 * merged into a few meshes (one draw each, plus outlines); the vending
 * machines are an instanced template. Texture maps come from NeonAtlas.
 */
export class CityModels {
  /**
   * Every building block as one mesh. Walls tile the facade texture by real
   * size (a window is 3 × 3.5 m), split into storeys-high bands so tall towers
   * repeat the window rows; street blocks get a shopfront band at the bottom.
   */
  static buildings(list: readonly Building[], maps: [THREE.Texture, THREE.Texture]): THREE.Mesh | null {
    const out = new BoxWriter()
    const tint = new THREE.Color()
    const up = new THREE.Vector3(0, 1, 0)
    for (const b of list) {
      tint.set(FACADE_TINTS[Math.floor(b.tint * FACADE_TINTS.length)])
      const m = frame(b.x, b.y, b.z, b.yaw)
      const hw = b.w / 2
      const hd = b.d / 2
      const top = b.h + 0.6
      // walls: (start corner, end corner) in local x/z, going round counter-clockwise seen from above
      const walls: [number, number, number, number][] = [
        [-hw, hd, hw, hd],
        [hw, hd, hw, -hd],
        [hw, -hd, -hw, -hd],
        [-hw, -hd, -hw, hd],
      ]
      for (const [x0, z0, x1, z1] of walls) {
        const len = Math.hypot(x1 - x0, z1 - z0)
        const u1 = len / TILE_W
        const n0 = new THREE.Vector3(Math.sign(x0), 0, Math.sign(z0))
        const n1 = new THREE.Vector3(Math.sign(x1), 0, Math.sign(z1))
        const band = (ya: number, yb: number, v0: number, v1: number) => {
          const na = ya === 0 ? n0.clone().setY(-1) : n0
          const nb = ya === 0 ? n1.clone().setY(-1) : n1
          const ta = yb === top ? n0.clone().add(up) : n0
          const tb = yb === top ? n1.clone().add(up) : n1
          const c = [new THREE.Vector3(x0, ya, z0), new THREE.Vector3(x1, ya, z1), new THREE.Vector3(x1, yb, z1), new THREE.Vector3(x0, yb, z0)]
          out.quad(m, c, [na, nb, tb, ta], [0, v0, u1, v1], tint)
        }
        let y = 0
        if (b.front) {
          band(0, SHOP_H + 0.6, 0, 0.25)
          y = SHOP_H + 0.6
        }
        while (y < top - 0.01) {
          const h = Math.min(TILE_H, top - y)
          band(y, y + h, 0.25, 0.25 + (0.75 * h) / TILE_H)
          y += h
        }
      }
      // the roof, one plain texel, plus a parapet-like rooftop block on bigger roofs
      const roofCorners = [new THREE.Vector3(-hw, top, hd), new THREE.Vector3(hw, top, hd), new THREE.Vector3(hw, top, -hd), new THREE.Vector3(-hw, top, -hd)]
      out.quad(m, roofCorners, roofCorners.map((c) => new THREE.Vector3(Math.sign(c.x), 1, Math.sign(c.z))), FRAME_UV, tint)
      if (b.w * b.d > 200) out.box(frame(b.x, b.y + top, b.z, b.yaw).multiply(new THREE.Matrix4().makeTranslation(-hw * 0.3, 0, -hd * 0.3)), b.w * 0.3, 2.2, b.d * 0.3, tint, () => FRAME_UV)
    }
    const geo = out.geometry()
    if (!geo) return null
    const mat = ToonMaterials.create({ color: '#ffffff', map: maps[0], vertexColors: true, emissive: '#ffffff', emissiveIntensity: 1.3 })
    mat.emissiveMap = maps[1]
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = 'city_buildings'
    mesh.receiveShadow = true
    return mesh
  }

  /** Neon signs as one mesh: thin panels whose two faces show their atlas cell (roof billboards on two legs). */
  static signs(list: readonly NeonSign[], atlas: THREE.Texture, name: string): THREE.Mesh | null {
    const out = new BoxWriter()
    const white = new THREE.Color('#ffffff')
    const leg = new THREE.Color('#2a2436')
    for (const s of list) {
      const cell = CityModels.cellUv(s)
      const m = frame(s.x, s.y - s.h / 2, s.z, s.yaw)
      // faces 2 and 3 are the panel's front (+Z) and back; the rim stays dark
      out.box(m, s.w, s.h, 0.22, white, (face) => (face === 2 || face === 3 ? cell : DARK_SIGN_UV))
      if (s.kind === 'roof') {
        for (const x of [-s.w * 0.35, s.w * 0.35]) out.box(frame(s.x, s.y - s.h / 2 - 2.6, s.z, s.yaw).multiply(new THREE.Matrix4().makeTranslation(x, 0, 0)), 0.25, 2.6, 0.25, leg, () => DARK_SIGN_UV)
      }
    }
    const geo = out.geometry()
    if (!geo) return null
    const mat = ToonMaterials.create({ color: '#ffffff', map: atlas, vertexColors: true, flatShading: false, bands: 2, emissive: '#ffffff', emissiveIntensity: 1.8 })
    mat.emissiveMap = atlas
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = name
    return mesh
  }

  /** Atlas rectangle (u0, v0, u1, v1) of a sign's cell: blades in the top half, bands (2 × 4) in the bottom half. */
  static cellUv(s: Pick<NeonSign, 'kind' | 'cell'>): [number, number, number, number] {
    if (s.kind === 'blade') return [s.cell / BLADE_CELLS, 0.5, (s.cell + 1) / BLADE_CELLS, 1]
    const col = s.cell % 2
    const row = Math.floor(s.cell / 2)
    const rows = BAND_CELLS / 2
    const v1 = 0.5 - row * (0.5 / rows)
    return [col / 2, v1 - 0.5 / rows, (col + 1) / 2, v1]
  }

  /**
   * The expressway: deck spans on square pillars, parapets, end abutments, and
   * cool light strips under both deck edges. Returns [concrete, light strips].
   */
  static expressway(city: CityLayout, terrain: TerrainHeights): [THREE.Mesh, THREE.Mesh] | null {
    const concrete = new BoxWriter()
    const strips = new BoxWriter()
    const grey = new THREE.Color('#8a8496')
    const dark = new THREE.Color('#5c566a')
    const top = city.deckY
    const step = 20
    for (let z = OVERPASS.z0; z < OVERPASS.z1; z += step) {
      const len = Math.min(step, OVERPASS.z1 - z)
      const zc = z + len / 2
      concrete.box(frame(OVERPASS.x, top - 1.3, zc), OVERPASS.width, 1.3, len, grey)
      for (const s of [-1, 1]) {
        concrete.box(frame(OVERPASS.x + s * (OVERPASS.width / 2 - 0.25), top, zc), 0.5, 1, len, dark)
        strips.box(frame(OVERPASS.x + s * (OVERPASS.width / 2 + 0.06), top - 0.55, zc), 0.12, 0.14, len - 0.4, dark)
      }
    }
    for (const p of city.pillars) {
      const ground = terrain.heightAt(p.x, p.z) - 0.5
      concrete.box(frame(p.x, ground, p.z), PILLAR.hx * 2, top - 1.3 - ground, PILLAR.hz * 2, dark)
      concrete.box(frame(p.x, top - 2.3, p.z), OVERPASS.width - 1, 1, 2.2, grey)
    }
    // abutments where the deck ends
    for (const z of [OVERPASS.z0, OVERPASS.z1]) {
      const ground = terrain.heightAt(OVERPASS.x, z) - 0.5
      concrete.box(frame(OVERPASS.x, ground, z), OVERPASS.width, top - ground, 3, dark)
    }
    const a = concrete.geometry()
    const b = strips.geometry()
    if (!a || !b) return null
    const deck = new THREE.Mesh(a, RegionMaterials.solid)
    deck.name = 'city_expressway'
    deck.castShadow = deck.receiveShadow = true
    const glow = new THREE.Mesh(b, RegionMaterials.coolGlow)
    glow.name = 'city_expressway_lights'
    return [deck, glow]
  }

  /** Vending machine, 1.9 m: a painted cabinet (instance tint) with a glowing display front (faces +Z). */
  static vendingMachine(): THREE.Group {
    const I = new THREE.Matrix4()
    const body = new PlantBuilder()
    body.add(new THREE.BoxGeometry(0.95, 1.85, 0.75).translate(0, 0.925, 0), I, '#bdbdbd', '#ffffff')
    body.add(new THREE.BoxGeometry(0.8, 0.22, 0.1).translate(0, 0.3, 0.4), I, '#303030')
    const glow = new PlantBuilder().add(new THREE.BoxGeometry(0.78, 1.15, 0.06).translate(0, 1.2, 0.37), I, '#ffffff')
    const group = body.build('city_vending', RegionMaterials.solid)
    group.add(glow.build('city_vending_glow', RegionMaterials.coolGlow).children[0])
    return group
  }
}
