import { CityLayout } from './cityLayout'
import type { RoadNetwork } from './roadNetwork'
import { SiteChecker, type Disc } from './siteChecker'
import { TempleLayout } from './templeLayout'
import type { TerrainHeights } from './terrain'

/**
 * Both regions' prop layouts, planned once per terrain (the roadside plants,
 * the forest and the renderer all ask for them). The valley is planned first,
 * then the ward, on one SiteChecker so neither places a prop in the other's.
 */
export class RegionLayouts {
  private static readonly cache = new WeakMap<TerrainHeights, RegionLayouts>()
  readonly temple: TempleLayout
  readonly city: CityLayout
  /** every disc the regions' props occupy (roadside plants and forest trees keep out) */
  readonly keepOuts: readonly Disc[]

  private constructor(roads: RoadNetwork, terrain: TerrainHeights) {
    const site = new SiteChecker(roads, terrain)
    this.temple = new TempleLayout(site)
    this.city = new CityLayout(site)
    this.keepOuts = site.claimed
  }

  /** The layouts for this road network and terrain (built on first use, then shared). */
  static of(roads: RoadNetwork, terrain: TerrainHeights): RegionLayouts {
    let r = RegionLayouts.cache.get(terrain)
    if (!r) RegionLayouts.cache.set(terrain, (r = new RegionLayouts(roads, terrain)))
    return r
  }
}
