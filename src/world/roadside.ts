import * as THREE from 'three/webgpu'
import { ModelLibrary } from '../render/loadModel'
import { palette } from '../render/palette'
import type { QualityTier } from '../render/post'
import { InstancedProps, placeMatrix } from './instancedProps'
import { ROADSIDE_KINDS, type RoadsideItem, type RoadsideKind, type RoadsideLayout } from './roadsideLayout'
import { VegetationModels } from './vegetationModels'

/** How each kind is drawn: its model, how far it is visible, and its colour variants. */
interface KindLook {
  /** procedural template, or the name of a glTF in public/models */
  model: (() => THREE.Object3D) | string
  /** small plants vanish sooner than trees (the fog and their size hide the pop) */
  cullDistance: number
  /** per-instance tints picked by the item's `tint` roll; none = the model's own colours */
  tints?: readonly string[]
}

const LOOKS: Readonly<Record<RoadsideKind, KindLook>> = {
  grass: { model: () => VegetationModels.grass(), cullDistance: 80, tints: [palette.grassOlive, palette.grassGold, palette.grassMoss, palette.grassRust, palette.grassGold] },
  flowers: { model: () => VegetationModels.flowers(), cullDistance: 80 },
  pampas: { model: () => VegetationModels.pampas(), cullDistance: 160 },
  fern: { model: () => VegetationModels.fern(), cullDistance: 140 },
  bush: { model: () => VegetationModels.bush(), cullDistance: 220, tints: [palette.foliageRed, palette.foliageOrange, palette.grassMoss, palette.foliageAmber, '#6a4a7a'] },
  rock: { model: 'rock_2', cullDistance: 260 },
  bamboo: { model: () => VegetationModels.bamboo(), cullDistance: 380 },
  jizo: { model: () => VegetationModels.jizo(), cullDistance: 160 },
}

/**
 * The roadside dressing (grass, flowers, susuki, ferns, shrubs, rocks, bamboo
 * groves and jizo statues): one culled InstancedProps per kind. Only the
 * starting tier's plants are built; a lower tier thins them further at runtime
 * (`setTier`) because the per-item keep rolls are absolute thresholds. The
 * perf governor only ever steps quality down, so nothing above it is needed.
 * No colliders and no cast shadows; plants are pass-through.
 */
export class Roadside {
  private readonly byKind = new Map<RoadsideKind, InstancedProps>()

  private constructor() {}

  /** Every kind's instanced set. */
  get sets(): InstancedProps[] {
    return [...this.byKind.values()]
  }

  /** Build the instances `tier` draws (glTF rocks load asynchronously). */
  static async build(layout: RoadsideLayout, tier: QualityTier): Promise<Roadside> {
    const roadside = new Roadside()
    const itemsByKind = new Map<RoadsideKind, RoadsideItem[]>()
    for (const it of layout.forTier(tier)) {
      let list = itemsByKind.get(it.kind)
      if (!list) itemsByKind.set(it.kind, (list = []))
      list.push(it)
    }
    const built = await Promise.all([...itemsByKind].map(async ([kind, items]) => [kind, await Roadside.buildKind(kind, items)] as const))
    for (const [kind, set] of built) if (set) roadside.byKind.set(kind, set)
    roadside.setTier(tier)
    return roadside
  }

  /** Thin every kind to its fraction for `tier` (low ⊂ mid ⊂ high: the per-item rolls are fixed); never adds plants beyond the built tier. */
  setTier(tier: QualityTier): void {
    for (const [kind, set] of this.byKind) set.setThinning(ROADSIDE_KINDS[kind].tier[tier])
  }

  private static async buildKind(kind: RoadsideKind, items: readonly RoadsideItem[]): Promise<InstancedProps | null> {
    const look = LOOKS[kind]
    const template = typeof look.model === 'string' ? await Roadside.loadOrNull(look.model) : look.model()
    if (!template) return null
    const transforms = items.map((it) => placeMatrix(it.x, it.y, it.z, it.yaw, it.scale))
    const tints = look.tints?.map((t) => new THREE.Color(t))
    const colors = tints ? items.map((it) => tints[Math.min(tints.length - 1, Math.floor(it.tint * tints.length))]) : undefined
    const keep = Float32Array.from(items, (it) => it.keep)
    return InstancedProps.fromTemplate(template, transforms, { shadows: false, receiveShadow: true, cullDistance: look.cullDistance, colors, keep })
  }

  private static async loadOrNull(name: string): Promise<THREE.Object3D | null> {
    try {
      return await ModelLibrary.load(name)
    } catch (err) {
      console.warn(`model ${name} failed to load`, err)
      return null
    }
  }
}
