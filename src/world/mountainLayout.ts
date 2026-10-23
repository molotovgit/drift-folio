import type { Vec3 } from '../core/math'
import { BIOMES, positionRoll } from './biomes'
import { mulberry32, type Placement } from './dressing'
import { leftOf } from './roadMesh'
import type { RoadEdge, RoadNetwork } from './roadNetwork'
import type { TerrainHeights } from './terrain'

/** Where props go on the mountain. Pure functions of the road network + terrain (deterministic). */

/** Lamps stand this far from the centreline on the outside of a hairpin. */
const LAMP_OFFSET = 6.5
/** extra lamps every N metres on these routes so the dusk roads read at night */
const LAMP_EVERY: Partial<Record<RoadEdge['route'], number>> = { summit: 60, platform: 140, systems: 120, town: 50, city: 26 }

export interface LampSpot {
  pos: Vec3
  /** yaw so the lamp arm (model −X) reaches over the road */
  yaw: number
  edgeId: string
  hairpin: boolean
}

/** One lamp outside every hairpin apex (plan Task 3.3) plus regular lamps on some routes. */
export function lampSpots(roads: RoadNetwork): LampSpot[] {
  const spots: LampSpot[] = []
  for (const e of roads.edges) {
    const apexes = new Set(e.hairpinApexes())
    for (const i of apexes) spots.push(lampAt(e, i, Math.sign(e.radius[i]) > 0 ? -1 : 1, true))
    const every = LAMP_EVERY[e.route]
    if (!every) continue
    for (let d = every / 2; d < e.length; d += every) {
      const i = Math.round((d / e.length) * (e.points.length - 1))
      // skip if a hairpin lamp is already close
      if ([...apexes].some((a) => Math.abs(e.dist[a] - e.dist[i]) < 30)) continue
      spots.push(lampAt(e, i, Math.floor(d / every) % 2 ? 1 : -1, false))
    }
  }
  return spots
}

/** Lamp at sample i on `side` (+1 = left of travel, −1 = right), arm pointing back over the road. */
function lampAt(e: RoadEdge, i: number, side: 1 | -1, hairpin: boolean): LampSpot {
  const p = e.points[i]
  const t = e.tangent(i)
  const l = leftOf(t.x, t.y)
  const ox = l.x * LAMP_OFFSET * side
  const oz = l.z * LAMP_OFFSET * side
  // the arm (local −X) must point toward the road: inward = (−ox, −oz); yaw maps local −X to (−cos, sin)
  const yaw = Math.atan2(-oz, ox)
  return { pos: { x: p.x + ox, y: p.y, z: p.z + oz }, yaw, edgeId: e.id, hairpin }
}

export interface TreeSpot {
  model: string
  x: number
  y: number
  z: number
  yaw: number
  scale: number
}

/** Keep trees this far from any road centreline. */
const TREE_CLEARANCE = 9
const TREE_GRID = 8.5

/**
 * Scatter maples near the roads (autumn colour where you drive) and pines
 * further up the slopes. Jittered grid, seeded, skips the town and the summit pad.
 */
export function treeSpots(roads: RoadNetwork, terrain: TerrainHeights, keepOut: readonly { x: number; z: number; r: number }[]): TreeSpot[] {
  const rnd = mulberry32(2026)
  const out: TreeSpot[] = []
  const { minX, minZ, size } = terrain.bounds
  for (let gz = minZ + 20; gz < minZ + size - 20; gz += TREE_GRID) {
    for (let gx = minX + 20; gx < minX + size - 20; gx += TREE_GRID) {
      const x = gx + (rnd() - 0.5) * TREE_GRID * 0.9
      const z = gz + (rnd() - 0.5) * TREE_GRID * 0.9
      const roll = rnd()
      const hit = roads.index.nearest(x, z, 70)
      const d = hit ? hit.dist : 999
      if (d < TREE_CLEARANCE) continue
      // dense near roads, thinner far away
      const density = d < 30 ? 0.55 : d < 70 ? 0.35 : 0.12
      if (roll > density) continue
      if (keepOut.some((k) => Math.hypot(k.x - x, k.z - z) < k.r)) continue
      // Lantern Valley is a maple valley
      const maple = (d < 45 ? rnd() < 0.75 : rnd() < 0.25) || BIOMES.weight('temple', x, z) > 0.5
      const model = maple ? `tree_maple_${Math.floor(rnd() * 4)}` : `tree_pine_${Math.floor(rnd() * 3)}`
      const yaw = rnd() * Math.PI * 2
      const scale = 0.8 + rnd() * 0.5
      // no forest in Neon Ward (a position roll after every draw, so the mountain's trees never reshuffle)
      if (positionRoll(x, z, 91) < BIOMES.weight('city', x, z)) continue
      out.push({ model, x, y: terrain.heightAt(x, z) - 0.2, z, yaw, scale })
    }
  }
  return out
}

/** Hand-placed landmarks: torii over the summit road, signposts at the forks, a few town buildings. */
export function landmarks(roads: RoadNetwork, terrain: TerrainHeights): Placement[] {
  const at = (edgeId: string, i: number, side: number, offset: number) => {
    const e = roads.edge(edgeId)
    const k = Math.min(e.points.length - 1, Math.max(0, i))
    const p = e.points[k]
    const t = e.tangent(k)
    const l = leftOf(t.x, t.y)
    const x = p.x + l.x * offset * side
    const z = p.z + l.z * offset * side
    return { x, z, y: terrain.heightAt(x, z), yaw: Math.atan2(t.x, t.y) }
  }
  const summit = roads.edge('summit')
  const torii = summit.points[14]
  const items: Placement[] = [
    // the car drives through the torii right after leaving the pit box
    { model: 'torii', x: torii.x, z: torii.z, y: torii.y - 0.1, yaw: 0 },
    { ...at('summit', 4, 1, 9), model: 'vending_machine_red' },
    { ...at('summit', 5, 1, 9), model: 'vending_machine_blue' },
    { ...at('summit', 30, -1, 13), model: 'shrine' },
    { ...at('platform', 3, -1, 7.5), model: 'signpost' },
    { ...at('platform-w', 2, 1, 7.5), model: 'signpost' },
    { ...at('town-ap', 30, 1, 14), model: 'tea_house' },
    { ...at('town-ps', 25, -1, 14), model: 'house_0' },
    { ...at('town-ps', 55, -1, 14), model: 'house_1' },
    { ...at('town-aw', 25, -1, 13), model: 'house_0' },
    // route signs where the regions branch off (labels: signposts.ts)
    { ...at('summit', 9, -1, 7.5), model: 'signpost' },
    { ...at('town-aw', roads.edge('town-aw').points.length - 11, -1, 7.5), model: 'signpost' },
    { ...at('valley-descent', roads.edge('valley-descent').points.length - 9, 1, 7.5), model: 'signpost' },
    { ...at('city-ramp', roads.edge('city-ramp').points.length - 9, 1, 7.5), model: 'signpost' },
  ]
  return items
}

/** Areas trees must avoid (summit pad, forks' signposts, the town). */
export function treeKeepOut(roads: RoadNetwork): { x: number; z: number; r: number }[] {
  const n = (id: string, r: number) => ({ x: roads.node(id).pos.x, z: roads.node(id).pos.z, r })
  return [n('summit', 30), n('townA', 45), n('townP', 60), n('townS', 45), n('townW', 40), { x: 0, z: 880, r: 70 }]
}
