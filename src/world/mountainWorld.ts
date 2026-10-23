import type RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { ModelLibrary } from '../render/loadModel'
import type { QualityTier } from '../render/post'
import { Checkpoints, type Checkpoint } from './checkpoints'
import { PropPlacer } from './dressing'
import { GroundPaint } from './groundPaint'
import { GuardRails } from './guardRails'
import { InstancedProps, placeMatrix } from './instancedProps'
import { lampSpots, landmarks, treeKeepOut, treeSpots, type TreeSpot } from './mountainLayout'
import { Roadside } from './roadside'
import { RoadsideLayout } from './roadsideLayout'
import { RoadMesh } from './roadMesh'
import { RoadNetwork } from './roadNetwork'
import { Signposts } from './signposts'
import { TerrainHeights } from './terrain'
import { TerrainCollider } from './terrainCollider'
import { TerrainMesh } from './terrainMesh'
import { TOWN_LOTS } from './townLayout'
import { allChannels, brokenRailChute, PEAK } from './shortcutLayout'

/**
 * The playable mountain (M3): roads, carved terrain, guard rails, lamps,
 * forest and landmarks, plus the checkpoint system. Geometry and colliders are
 * built synchronously; glTF props load in `dress()`.
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
  /** the forest plus the roadside tree clusters (placed before the terrain is painted: canopy shade) */
  private readonly trees: TreeSpot[]
  /** grass, flowers, shrubs, rocks, bamboo and jizo along the roads */
  private readonly roadside: RoadsideLayout

  constructor(
    private readonly scene: THREE.Scene,
    world: RAPIER.World,
  ) {
    const peakLot = { name: 'peak' as const, x: PEAK.x, z: PEAK.z, r: PEAK.r, y: PEAK.y }
    this.terrain = new TerrainHeights(this.roads, [...TOWN_LOTS, peakLot], allChannels(this.roads))
    this.terrainCollider = new TerrainCollider(world, this.terrain)
    this.roadside = new RoadsideLayout(this.roads, this.terrain)
    this.trees = [...treeSpots(this.roads, this.terrain, treeKeepOut(this.roads)), ...this.roadside.trees]
    const canopies = [
      ...this.trees.map((t) => ({ x: t.x, z: t.z, r: 5 * t.scale })),
      ...this.roadside.items.filter((i) => i.kind === 'bamboo').map((i) => ({ x: i.x, z: i.z, r: 3 * i.scale })),
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

  /** Per-frame: re-cull instanced props against the camera. */
  update(camera: THREE.Camera): void {
    for (const p of this.instanced) p.update(camera)
  }

  /** Instances drawn this frame across all culled props (for tests/budgets). */
  get drawnInstances(): number {
    return this.instanced.reduce((n, p) => n + p.drawCount, 0)
  }

  heightAt(x: number, z: number): number {
    return this.terrain.heightAt(x, z)
  }

  /** World positions of every lamp bulb (valid after `dress`). */
  get lamps(): readonly THREE.Vector3[] {
    return this.lampAnchors
  }

  /** Load and place lamps, the forest, the roadside plants (thinned for `tier`) and landmarks. */
  async dress(tier: QualityTier = 'high'): Promise<void> {
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
      PropPlacer.place(this.scene, landmarks(this.roads, this.terrain)),
    ])
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
