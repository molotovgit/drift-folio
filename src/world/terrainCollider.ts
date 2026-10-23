import RAPIER from '@dimforge/rapier3d-compat'
import { surfaceOf } from '../vehicle/wheel'
import type { TerrainHeights } from './terrain'

/**
 * Rapier heightfield for the terrain, tagged 'terrain' so wheels know they are
 * off the road. Rapier wants heights column-major with rows along Z and columns
 * along X, centred on the collider's translation.
 */
export class TerrainCollider {
  readonly collider: RAPIER.Collider

  constructor(world: RAPIER.World, terrain: TerrainHeights) {
    const n = terrain.cells + 1
    // our grid is row-major [iz][ix]; Rapier's column-major [col=ix][row=iz] is the same memory order
    const heights = new Float32Array(n * n)
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) heights[ix * n + iz] = terrain.heights[iz * n + ix]
    const { minX, minZ, size } = terrain.bounds
    const desc = RAPIER.ColliderDesc.heightfield(terrain.cells, terrain.cells, heights, { x: size, y: 1, z: size })
      .setTranslation(minX + size / 2, 0, minZ + size / 2)
      .setFriction(0.7)
    this.collider = world.createCollider(desc)
    surfaceOf.set(this.collider.handle, 'terrain')
  }
}
