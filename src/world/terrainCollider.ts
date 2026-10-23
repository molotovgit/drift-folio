import RAPIER from '@dimforge/rapier3d-compat'
import { surfaceOf } from '../vehicle/wheel'
import type { TerrainHeights } from './terrain'

/** horizontal offset of the collider from the height grid, metres (see the constructor) */
export const GRID_NUDGE = 1e-3

/**
 * Rapier heightfield for the terrain, tagged 'terrain' so wheels know they are
 * off the road. Rapier wants heights column-major with rows along Z and columns
 * along X, centred on the collider's translation.
 */
export class TerrainCollider {
  readonly collider: RAPIER.Collider

  constructor(world: RAPIER.World, terrain: TerrainHeights) {
    const n = terrain.cells + 1
    // our grid is row-major [iz][ix]; Rapier wants column-major with X as the major axis, so transpose
    const heights = new Float32Array(n * n)
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) heights[ix * n + iz] = terrain.heights[iz * n + ix]
    const { minX, minZ, size } = terrain.bounds
    // nudged a millimetre off the grid: a vertical ray exactly down one of the
    // heightfield's cell lines can slip through it in Rapier (the larger the
    // field, the more lines do), and rays at round world coordinates — spawn
    // points, probes, a wheel parked on a node — land on the 4 m grid lines
    const desc = RAPIER.ColliderDesc.heightfield(terrain.cells, terrain.cells, heights, { x: size, y: 1, z: size })
      .setTranslation(minX + size / 2 + GRID_NUDGE, 0, minZ + size / 2 + GRID_NUDGE)
      .setFriction(0.7)
    this.collider = world.createCollider(desc)
    surfaceOf.set(this.collider.handle, 'terrain')
  }
}
