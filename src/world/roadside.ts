import * as THREE from 'three/webgpu'
import { ModelLibrary } from '../render/loadModel'
import { palette } from '../render/palette'
import type { QualityTier } from '../render/post'
import { InstancedProps, placeMatrix } from './instancedProps'
import type { RoadsideItem, RoadsideKind, RoadsideLayout } from './roadsideLayout'
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
  grass: { model: () => VegetationModels.grass(), cullDistance: 110, tints: [palette.grassOlive, palette.grassGold, palette.grassMoss, palette.grassRust, palette.grassGold] },
  flowers: { model: () => VegetationModels.flowers(), cullDistance: 110 },
  pampas: { model: () => VegetationModels.pampas(), cullDistance: 160 },
  fern: { model: () => VegetationModels.fern(), cullDistance: 140 },
  bush: { model: () => VegetationModels.bush(), cullDistance: 220, tints: [palette.foliageRed, palette.foliageOrange, palette.grassMoss, palette.foliageAmber, '#6a4a7a'] },
  rock: { model: 'rock_2', cullDistance: 260 },
  bamboo: { model: () => VegetationModels.bamboo(), cullDistance: 380 },
  jizo: { model: () => VegetationModels.jizo(), cullDistance: 160 },
}

/**
 * The roadside dressing (grass, flowers, susuki, ferns, shrubs, rocks, bamboo
 * groves and jizo statues): one culled InstancedProps per kind, thinned for
 * the quality tier. No colliders and no cast shadows; plants are pass-through.
 */
export class Roadside {
  readonly sets: InstancedProps[] = []

  private constructor() {}

  /** Build every kind's instances for `tier` (glTF rocks load asynchronously). */
  static async build(layout: RoadsideLayout, tier: QualityTier): Promise<Roadside> {
    const roadside = new Roadside()
    const byKind = new Map<RoadsideKind, RoadsideItem[]>()
    for (const it of layout.forTier(tier)) {
      let list = byKind.get(it.kind)
      if (!list) byKind.set(it.kind, (list = []))
      list.push(it)
    }
    const sets = await Promise.all(
      [...byKind].map(async ([kind, items]) => {
        const look = LOOKS[kind]
        const template = typeof look.model === 'string' ? await Roadside.loadOrNull(look.model) : look.model()
        if (!template) return null
        const transforms = items.map((it) => placeMatrix(it.x, it.y, it.z, it.yaw, it.scale))
        const tints = look.tints?.map((t) => new THREE.Color(t))
        const colors = tints ? items.map((it) => tints[Math.min(tints.length - 1, Math.floor(it.tint * tints.length))]) : undefined
        return InstancedProps.fromTemplate(template, transforms, { shadows: false, receiveShadow: true, cullDistance: look.cullDistance, colors })
      }),
    )
    for (const s of sets) if (s) roadside.sets.push(s)
    return roadside
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
