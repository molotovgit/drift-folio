import RAPIER from '@dimforge/rapier3d-compat'

const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })

/** Height of the first solid surface under (x, z), ignoring `exclude`. Falls back to 0. */
export function groundHeight(world: RAPIER.World, x: number, z: number, exclude?: RAPIER.RigidBody, from = 400): number {
  ray.origin = { x, y: from, z }
  const hit = world.castRay(ray, from * 2, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, exclude)
  return hit ? from - hit.timeOfImpact : 0
}
