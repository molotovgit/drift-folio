import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import type { QualityTier } from '../render/post'
import { surfaceOf } from '../vehicle/wheel'
import { CITY_TIERS, OVERPASS, PILLAR } from './cityLayout'
import { CityModels } from './cityModels'
import { InstancedProps, placeMatrix } from './instancedProps'
import { NeonAtlas } from './neonAtlas'
import type { RegionLayouts } from './regionLayouts'
import { RegionSurfaces } from './regionSurfaces'
import type { RoadNetwork } from './roadNetwork'
import { TEMPLE_TIERS, type PropSpot, type TempleKind } from './templeLayout'
import { TempleModels } from './templeModels'
import type { TerrainHeights } from './terrain'
import { VegetationModels } from './vegetationModels'

/** merged region meshes and the biggest region props are drawn only this close to the camera (the fog is opaque by ~420 m) */
export const REGION_DRAW_DISTANCE = 600
/** How each instanced region kind is drawn. */
interface KindLook {
  model: () => THREE.Object3D
  cullDistance: number
  shadows: boolean
  tiers: Readonly<Record<QualityTier, number>>
}

const LOOKS: Readonly<Record<TempleKind | 'vending', KindLook>> = {
  gate: { model: () => TempleModels.gate(), cullDistance: REGION_DRAW_DISTANCE, shadows: true, tiers: TEMPLE_TIERS.gate },
  hall: { model: () => TempleModels.hall(), cullDistance: REGION_DRAW_DISTANCE, shadows: true, tiers: TEMPLE_TIERS.hall },
  pagoda: { model: () => TempleModels.pagoda(), cullDistance: REGION_DRAW_DISTANCE, shadows: true, tiers: TEMPLE_TIERS.pagoda },
  bridge: { model: () => TempleModels.bridge(), cullDistance: 260, shadows: false, tiers: TEMPLE_TIERS.bridge },
  lantern: { model: () => TempleModels.lantern(), cullDistance: 220, shadows: false, tiers: TEMPLE_TIERS.lantern },
  torii: { model: () => TempleModels.torii(), cullDistance: 280, shadows: false, tiers: TEMPLE_TIERS.torii },
  paddy: { model: () => TempleModels.paddy(), cullDistance: 320, shadows: false, tiers: TEMPLE_TIERS.paddy },
  grove: { model: () => VegetationModels.bamboo(), cullDistance: 380, shadows: false, tiers: TEMPLE_TIERS.grove },
  vending: { model: () => CityModels.vendingMachine(), cullDistance: 160, shadows: false, tiers: CITY_TIERS.vending },
}
/** vending cabinet paints: red, blue, white, yellow */
const VENDING_TINTS = ['#d23a3a', '#3a6ad2', '#f0f0f0', '#e0b030'].map((c) => new THREE.Color(c))

/**
 * Lantern Valley's and Neon Ward's props in the scene: one culled instanced
 * set per valley kind and for the vending machines (thinned per tier like the
 * roadside plants), and the ward's merged static meshes (buildings, signs,
 * expressway, pavements, the wet sheen) plus the valley's water. Low tier
 * goes without the small signs and the wet sheen (CITY_TIERS.detail). The
 * merged meshes are far past the fog from most of the mountain, so each is
 * drawn only within REGION_DRAW_DISTANCE of the camera (`update`).
 */
export class RegionProps {
  /** culled instanced sets (re-culled by the world each frame) */
  readonly sets: InstancedProps[] = []
  /** static meshes */
  readonly group = new THREE.Group()
  private readonly thinned: { set: InstancedProps; tiers: Readonly<Record<QualityTier, number>> }[] = []
  /** every merged mesh with its world bounding box (tighter than a sphere round a long street), and whether it is tier detail */
  private readonly statics: { mesh: THREE.Mesh; box: THREE.Box3; detail: boolean }[] = []
  private tierShowsDetail = true

  private constructor() {
    this.group.name = 'regions'
  }

  /**
   * Build the props `tier` draws (lower tiers thin them further at runtime, see
   * `setTier`; the governor only steps down, so detail a tier never shows is never built).
   */
  static async build(layouts: RegionLayouts, roads: RoadNetwork, terrain: TerrainHeights, tier: QualityTier): Promise<RegionProps> {
    const props = new RegionProps()
    const { temple, city } = layouts
    for (const kind of Object.keys(temple.spots) as TempleKind[]) props.instanced(kind, temple.forTier(kind, tier))
    const vending = city.vendingForTier(tier)
    props.instanced(
      'vending',
      vending,
      vending.map((v) => VENDING_TINTS[Math.floor(v.keep * 997) % VENDING_TINTS.length]),
    )
    // the sign atlas letters its band signs in the display face: wait for it like the billboards do
    await NeonAtlas.ready()
    const [facade, glow] = NeonAtlas.facade()
    const atlas = NeonAtlas.signs()
    props.add(CityModels.buildings(city.buildings, [facade, glow]), false)
    props.add(
      CityModels.signs(
        city.signs.filter((s) => s.primary),
        atlas,
        'city_signs',
      ),
      false,
    )
    for (const m of CityModels.expressway(city, terrain) ?? []) props.add(m, false)
    props.add(RegionSurfaces.pavements(roads).mesh, false)
    props.add(RegionSurfaces.water(), false)
    if (CITY_TIERS.detail[tier] > 0) {
      props.add(
        CityModels.signs(
          city.signs.filter((s) => !s.primary),
          atlas,
          'city_signs_small',
        ),
        true,
      )
      props.add(RegionSurfaces.wetSheen(roads, city.signs), true)
    }
    props.setTier(tier)
    return props
  }

  /** Thin the instanced kinds to their fraction for `tier`; drop the detail meshes where the tier has none. */
  setTier(tier: QualityTier): void {
    for (const { set, tiers } of this.thinned) set.setThinning(tiers[tier])
    this.tierShowsDetail = CITY_TIERS.detail[tier] > 0
    for (const s of this.statics) if (s.detail && !this.tierShowsDetail) s.mesh.visible = false
  }

  /** Per frame: draw each merged mesh only while the camera is within REGION_DRAW_DISTANCE of it. */
  update(camera: THREE.Camera): void {
    for (const s of this.statics) {
      const near = s.box.distanceToPoint(camera.position) < REGION_DRAW_DISTANCE
      s.mesh.visible = near && (!s.detail || this.tierShowsDetail)
    }
  }

  /**
   * Compile every region mesh's pipeline at load, while the loading screen is
   * up: the merged meshes start hidden (far from the summit), so otherwise
   * WebGPU would compile them on the first approach and stutter (phones).
   * Shows them all for the compile; the next `update` hides the far ones again.
   */
  async warmUp(renderer: THREE.WebGPURenderer, camera: THREE.Camera, scene: THREE.Scene): Promise<void> {
    for (const s of this.statics) s.mesh.visible = !s.detail || this.tierShowsDetail
    try {
      await renderer.compileAsync(this.group, camera, scene)
    } catch (err) {
      console.warn('region pipelines did not precompile; they compile on first sight', err)
    }
  }

  /** How many merged meshes are drawn now (for tests/budgets). */
  get visibleStatics(): number {
    return this.statics.filter((s) => s.mesh.visible).length
  }

  private add(mesh: THREE.Mesh | null, detail: boolean): void {
    if (!mesh) return
    mesh.geometry.computeBoundingBox()
    this.statics.push({ mesh, box: mesh.geometry.boundingBox!.clone(), detail })
    this.group.add(mesh)
  }

  /**
   * Fixed colliders (sync, before any prop is drawn): the street blocks and
   * towers, the temple hall, pagoda and crest gate posts, the expressway's
   * pillars and abutments (tagged 'rail', so a hard hit is a crash like a
   * guard rail), and the pavements (tagged 'road').
   */
  static colliders(world: RAPIER.World, layouts: RegionLayouts, roads: RoadNetwork, terrain: TerrainHeights): void {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    const solid = (x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0) => {
      const c = world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz)
          .setTranslation(x, y + hy, z)
          .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
        body,
      )
      surfaceOf.set(c.handle, 'rail')
    }
    const { temple, city } = layouts
    for (const b of city.buildings) solid(b.x, b.y, b.z, b.w / 2, (b.h + 0.6) / 2, b.d / 2, b.yaw)
    for (const h of temple.spots.hall) solid(h.x, h.y, h.z, 11, 6, 8, h.yaw)
    for (const p of temple.spots.pagoda) solid(p.x, p.y, p.z, 4.5, 10, 4.5, p.yaw)
    for (const g of temple.spots.gate) {
      // one block round each pair of posts, 6.8 m either side of the road
      for (const s of [-1, 1]) solid(g.x + Math.cos(g.yaw) * 6.8 * s, g.y, g.z - Math.sin(g.yaw) * 6.8 * s, 0.5, 3.5, 1.8, g.yaw)
    }
    for (const p of city.pillars) {
      const ground = terrain.heightAt(p.x, p.z) - 0.5
      solid(p.x, ground, p.z, PILLAR.hx, (city.deckY - ground) / 2, PILLAR.hz)
    }
    for (const z of [OVERPASS.z0, OVERPASS.z1]) {
      const ground = terrain.heightAt(OVERPASS.x, z) - 0.5
      solid(OVERPASS.x, ground, z, OVERPASS.width / 2, (city.deckY - ground) / 2, 1.5)
    }
    RegionSurfaces.pavementCollider(world, roads)
  }

  /** One culled instanced set for a kind (nothing when the tier keeps none). */
  private instanced(kind: keyof typeof LOOKS, spots: readonly PropSpot[], colors?: THREE.Color[]): void {
    if (!spots.length) return
    const look = LOOKS[kind]
    const transforms = spots.map((s) => placeMatrix(s.x, s.y, s.z, s.yaw, s.scale))
    const keep = Float32Array.from(spots, (s) => s.keep)
    const set = InstancedProps.fromTemplate(look.model(), transforms, { shadows: look.shadows, receiveShadow: true, cullDistance: look.cullDistance, keep, colors })
    this.sets.push(set)
    this.group.add(set.group)
    this.thinned.push({ set, tiers: look.tiers })
  }
}
