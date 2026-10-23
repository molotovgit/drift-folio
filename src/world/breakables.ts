import RAPIER from '@dimforge/rapier3d-compat'
import type * as THREE from 'three/webgpu'
import type { Vec3 } from '../core/math'
import { ModelLibrary } from '../render/loadModel'
import { DynamicProps } from './dynamicProps'
import { leftOf } from './roadMesh'
import type { RoadNetwork } from './roadNetwork'
import { RAIL_MAX_RADIUS } from './guardRails'

/** Fence segments are 3 m long; each run is FENCE_RUN segments. */
const FENCE_LENGTH = 3
const FENCE_RUN = 8
/** fence runs keep this far (along the road) from either end of the Automation Pass */
const JUNCTION_CLEAR = 60
const FENCE_OFFSET = 6.2
const MAC_MINIS = 5

export interface FenceSpot {
  pos: Vec3
  yaw: number
}

/**
 * Wooden fences along the outside of moderate Automation Pass sweepers (no
 * guard rail there): three runs, centred on the tightest non-railed bends.
 */
export function fenceSpots(roads: RoadNetwork): FenceSpot[] {
  const e = roads.edge('automation')
  const candidates = e.points
    .map((_, i) => i)
    .filter((i) => Math.abs(e.radius[i]) > RAIL_MAX_RADIUS && Math.abs(e.radius[i]) < 160)
    // not where the road bends into a junction: a run there would stand in the other roads
    .filter((i) => e.dist[i] > JUNCTION_CLEAR && e.length - e.dist[i] > JUNCTION_CLEAR)
    .sort((a, b) => Math.abs(e.radius[a]) - Math.abs(e.radius[b]))
  const centres: number[] = []
  for (const i of candidates) {
    if (centres.every((c) => Math.abs(e.dist[c] - e.dist[i]) > 120)) centres.push(i)
    if (centres.length === 3) break
  }
  const spots: FenceSpot[] = []
  const step = Math.round(FENCE_LENGTH / 2) // samples are 2 m apart
  for (const c of centres) {
    // outside of the bend: opposite to the turn (radius sign: + = left turn)
    const side = e.radius[c] > 0 ? -1 : 1
    for (let k = -FENCE_RUN / 2; k < FENCE_RUN / 2; k++) {
      const i = Math.min(e.points.length - 1, Math.max(0, c + k * step))
      const p = e.points[i]
      const t = e.tangent(i)
      const l = leftOf(t.x, t.y)
      spots.push({ pos: { x: p.x + l.x * FENCE_OFFSET * side, y: p.y, z: p.z + l.z * FENCE_OFFSET * side }, yaw: Math.atan2(t.x, t.y) + Math.PI / 2 })
    }
  }
  return spots
}

/**
 * Knock-around props: breakable fences on the sweepers and a convoy of Mac
 * minis in the cluster yard (easter egg: hitting one shows "commit by Mac Mini 5").
 */
export class Breakables {
  private readonly physics: DynamicProps
  private readonly macIdx: number[] = []
  private macHit = false

  constructor(
    scene: THREE.Scene,
    world: RAPIER.World,
    private readonly roads: RoadNetwork,
    private readonly groundAt: (x: number, z: number) => number,
  ) {
    this.physics = new DynamicProps(world, scene)
  }

  async build(): Promise<void> {
    const [fence, mac] = await Promise.all([ModelLibrary.load('fence_segment'), ModelLibrary.load('mac_mini')])
    for (const f of fenceSpots(this.roads)) {
      const m = fence.clone(true)
      m.rotation.y = f.yaw
      const y = Math.min(f.pos.y, this.groundAt(f.pos.x, f.pos.z))
      const collider = RAPIER.ColliderDesc.cuboid(FENCE_LENGTH / 2, 0.55, 0.08).setRotation({ x: 0, y: Math.sin(f.yaw / 2), z: 0, w: Math.cos(f.yaw / 2) })
      this.physics.add(m, collider, { ...f.pos, y }, 0.55, 18)
    }
    const e = this.roads.edge('cluster')
    const i0 = Math.floor(e.points.length * 0.45)
    for (let k = 0; k < MAC_MINIS; k++) {
      const i = i0 + k * 3
      const p = e.points[i]
      const t = e.tangent(i)
      const l = leftOf(t.x, t.y)
      const at = { x: p.x + l.x * 3, y: p.y, z: p.z + l.z * 3 }
      this.macIdx.push(this.physics.add(mac.clone(true), RAPIER.ColliderDesc.cuboid(0.6, 0.15, 0.6), at, 0.15, 25))
    }
  }

  /** Sync props; returns true the first time a Mac mini is knocked. */
  update(): { macMiniHit: boolean } {
    this.physics.sync()
    if (!this.macHit && this.macIdx.some((i) => this.physics.displaced(i, 0.5))) {
      this.macHit = true
      return { macMiniHit: true }
    }
    return { macMiniHit: false }
  }
}
