import type RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { ModelLibrary } from '../render/loadModel'
import type { QualityTier } from '../render/post'
import { Checkpoints, type Checkpoint } from './checkpoints'
import { PropPlacer } from './dressing'
import { GroundPaint } from './groundPaint'
import { GuardRails } from './guardRails'
import { CullScheduler, InstancedProps, placeMatrix } from './instancedProps'
import { lampSpots, landmarks, treeKeepOut, treeSpots, type TreeSpot } from './mountainLayout'
import { RegionLayouts } from './regionLayouts'
import { RegionProps } from './regionProps'
import { Roadside } from './roadside'
import { RoadsideLayout } from './roadsideLayout'
import { RoadMesh } from './roadMesh'
import { RoadNetwork } from './roadNetwork'
import { Signposts } from './signposts'
import { TerrainHeights } from './terrain'
import { TerrainCollider } from './terrainCollider'
import { TerrainMesh } from './terrainMesh'
import { TEMPLE_LOTS } from './templeLayout'
import { TOWN_LOTS } from './townLayout'
import { allChannels, brokenRailChute, PEAK } from './shortcutLayout'

/**
 * The playable world (M3): the mountain pass plus Lantern Valley and Neon
 * Ward — roads, carved terrain, guard rails, lamps, forest, landmarks and the
 * regions' props, plus the checkpoint system. Geometry and colliders are built
 * synchronously; glTF props load and region props are built in `dress()`.
 */
export class MountainWorld {
  readonly roads = new RoadNetwork()
  readonly terrain: TerrainHeights
  readonly checkpoints: Checkpoints
  /** where the car starts: the summit pit box, facing downhill (+Z) */
  readonly start: Checkpoint
  readonly rails: GuardRails
  readonly terrainCollider: TerrainCollider
  /** route signs at the two forks */
  readonly signposts: Signposts
  private lampAnchors: THREE.Vector3[] = []
  /** culled instanced props (forest, lamps, roadside plants), re-culled every frame from the camera */
  private readonly instanced: InstancedProps[] = []
  /** staggers those re-culls over frames */
  private readonly culler = new CullScheduler()
  /** the forest plus the roadside tree clusters (placed before the terrain is painted: canopy shade) */
  private readonly trees: TreeSpot[]
  /** grass, flowers, shrubs, rocks, bamboo and jizo along the roads */
  private readonly roadside: RoadsideLayout
  /** the built roadside sets (after `dress`) and the tier they are thinned for */
  private roadsideSets: Roadside | null = null
  /** where Lantern Valley's and Neon Ward's props stand */
  readonly regions: RegionLayouts
  /** their built props (after `dress`) */
  private regionProps: RegionProps | null = null
  private tier: QualityTier = 'high'

  constructor(
    private readonly scene: THREE.Scene,
    world: RAPIER.World,
  ) {
    const peakLot = { name: 'peak' as const, x: PEAK.x, z: PEAK.z, r: PEAK.r, y: PEAK.y }
    this.terrain = new TerrainHeights(this.roads, [...TOWN_LOTS, peakLot, ...TEMPLE_LOTS], allChannels(this.roads))
    this.terrainCollider = new TerrainCollider(world, this.terrain)
    this.regions = RegionLayouts.of(this.roads, this.terrain)
    RegionProps.colliders(world, this.regions, this.roads, this.terrain)
    const forestKeepOut = treeKeepOut(this.roads)
    // the roadside layout adds the regions' keep-outs itself; the forest gets them here
    this.roadside = new RoadsideLayout(this.roads, this.terrain, forestKeepOut)
    this.trees = [...treeSpots(this.roads, this.terrain, forestKeepOut, this.regions.keepOuts), ...this.roadside.trees]
    const canopies = [
      ...this.trees.map((t) => ({ x: t.x, z: t.z, r: 5 * t.scale })),
      ...this.roadside.items.filter((i) => i.kind === 'bamboo').map((i) => ({ x: i.x, z: i.z, r: 3 * i.scale })),
      ...this.regions.temple.spots.grove.map((g) => ({ x: g.x, z: g.z, r: 3 * g.scale })),
    ]
    scene.add(new TerrainMesh(this.terrain, new GroundPaint(this.roads, canopies)).mesh)
    scene.add(new RoadMesh(this.roads, world).group)
    this.signposts = new Signposts(this.roads)
    // S3: a deliberate break in the rail at the top of the broken-rail chute
    const chuteTop = brokenRailChute(this.roads).points[0]
    this.rails = new GuardRails(this.roads, world, [{ x: chuteTop.x, z: chuteTop.z, r: 10 }])
    scene.add(this.rails.group)

    const summit = this.roads.edge('summit')
    this.start = { pos: { ...summit.points[3] }, yaw: 0, edgeId: 'summit' }
    this.checkpoints = new Checkpoints(this.roads, (x, z) => this.heightAt(x, z), this.start)
  }

  /** Per-frame: re-cull instanced props against the camera (a few sets per frame). */
  update(camera: THREE.Camera): void {
    this.culler.update(this.instanced, camera)
    this.regionProps?.update(camera)
  }

  /**
   * Thin the roadside plants for a quality tier. Safe before `dress` (applied
   * when the plants are built) and at runtime when the perf governor drops a tier.
   */
  setTier(tier: QualityTier): void {
    this.tier = tier
    this.roadsideSets?.setTier(tier)
    this.regionProps?.setTier(tier)
  }

  /** Instances drawn this frame across all culled props (for tests/budgets). */
  get drawnInstances(): number {
    return this.instanced.reduce((n, p) => n + p.drawCount, 0)
  }

  heightAt(x: number, z: number): number {
    return this.terrain.heightAt(x, z)
  }

  /** World positions of every lamp bulb (valid after `dress`). */
  /** Precompile the region props' pipelines (after `dress`, before the game reports ready). */
  async warmUp(renderer: THREE.WebGPURenderer, camera: THREE.Camera): Promise<void> {
    await this.regionProps?.warmUp(renderer, camera, this.scene)
  }

  get lamps(): readonly THREE.Vector3[] {
    return this.lampAnchors
  }

  /** Load and place lamps, the forest, the roadside plants (thinned for `tier`) and landmarks. */
  async dress(tier: QualityTier = this.tier): Promise<void> {
    this.tier = tier
    // lamps stand on the ground beside the road (the terrain starts sloping away there)
    const lamps = lampSpots(this.roads).map((l) => ({ ...l, pos: { ...l.pos, y: Math.min(l.pos.y, this.heightAt(l.pos.x, l.pos.z)) } }))
    const byModel = new Map<string, THREE.Matrix4[]>()
    for (const t of this.trees) {
      let list = byModel.get(t.model)
      if (!list) byModel.set(t.model, (list = []))
      list.push(placeMatrix(t.x, t.y, t.z, t.yaw, t.scale))
    }
    const [roadside, lampProps, ...forest] = await Promise.all([
      Roadside.build(this.roadside, tier),
      InstancedProps.create('lamp', lamps.map((l) => placeMatrix(l.pos.x, l.pos.y, l.pos.z, l.yaw))),
      ...[...byModel].map(([model, transforms]) => InstancedProps.create(model, transforms)),
      PropPlacer.place(this.scene, [...landmarks(this.roads, this.terrain), ...this.regions.temple.landmarks]),
    ])
    // the regions' props are procedural (no loading): the valley's temple, paddies and lanterns, the ward's blocks and neon
    const regionProps = await RegionProps.build(this.regions, this.roads, this.terrain, tier)
    this.scene.add(regionProps.group)
    this.instanced.push(...regionProps.sets)
    this.regionProps = regionProps
    for (const p of [lampProps, ...forest]) {
      if (!(p instanceof InstancedProps)) {
        this.signposts.label(p)
        continue
      }
      this.scene.add(p.group)
      this.instanced.push(p)
    }
    for (const p of roadside.sets) {
      this.scene.add(p.group)
      this.instanced.push(p)
    }
    // the governor may have dropped the tier while the models loaded
    this.roadsideSets = roadside
    roadside.setTier(this.tier)
    regionProps.setTier(this.tier)
    this.lampAnchors = await this.bulbPositions(lamps)
  }

  /** The bulb sits at the lamp model's `light_anchor`; transform it to each lamp. */
  private async bulbPositions(lamps: ReturnType<typeof lampSpots>): Promise<THREE.Vector3[]> {
    const template = await ModelLibrary.load('lamp')
    template.updateMatrixWorld(true)
    const anchor = template.getObjectByName('light_anchor')
    const local = anchor ? anchor.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(-2.2, 6.8, 0)
    return lamps.map((l) => local.clone().applyMatrix4(placeMatrix(l.pos.x, l.pos.y, l.pos.z, l.yaw)))
  }
}
