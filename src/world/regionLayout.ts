import type { EdgeDef, NodeDef } from './roadLayout'

/**
 * The two themed regions beyond the mountain pass, as road data (merged into
 * NODE_DEFS / EDGE_DEFS by roadLayout). World axes as there: +Z is downhill
 * from the summit, +X the driver's left on the way down.
 *
 * Lantern Valley (route 'temple'): a rural temple valley behind the summit, on
 * the −X side. The valley road leaves the summit pad westward (−X), climbs
 * gently to a crest gate, then drops into a loop of two roads between the
 * valley gate and the temple: the paddy road along the terraced south slope
 * and the hairpin road round the far hillside.
 *
 * Neon Ward (route 'city'): a night district on the flat ground south (+Z) of
 * the base town, reached from the town's west end. One avenue runs east and
 * hairpins back round the far block; a short alley closes the loop.
 *
 * New roads attach only to nodes no Systems Drop road touches (the recorded
 * ghost lap is pinned to those surfaces). Each new road end leaves its node at
 * an angle that keeps the existing through-road pairings there, and with about
 * the grade the node's plane already has that way, so the existing roads at
 * the summit and the town's west end keep their shape.
 */

const N = (id: string, x: number, y: number, z: number): NodeDef => ({ id, x, y, z })
const E = (id: string, from: string, to: string, route: EdgeDef['route'], ctrl: [number, number][]): EdgeDef => ({ id, from, to, route, ctrl })

export const REGION_NODE_DEFS: readonly NodeDef[] = [
  // the crest west of the summit: the summit plane already rises about 4 % this way
  N('valleyCrest', -130, 5, -18),
  N('valleyGate', -350, -18, 45),
  N('valleyTemple', -540, -38, 150),
  // the town's west end plane falls about 4 % toward the ward
  N('cityGate', 290, -125, 1030),
  N('cityBack', 330, -127, 1185),
]

export const REGION_EDGE_DEFS: readonly EdgeDef[] = [
  // Lantern Valley: from the summit pad west up to the crest...
  E('valley-road', 'summit', 'valleyCrest', 'temple', [[-40, -32], [-90, -27]]),
  // ...and down the far side to the valley gate
  E('valley-descent', 'valleyCrest', 'valleyGate', 'temple', [[-190, -5], [-250, 20], [-300, 22]]),
  // the paddy road: sweepers along the terraced south slope
  E('valley-paddies', 'valleyGate', 'valleyTemple', 'temple', [[-372, 95], [-410, 145], [-470, 180]]),
  // the hairpin road: west along the north hillside, round the far hairpin, back down to the temple
  E('valley-hairpin', 'valleyGate', 'valleyTemple', 'temple', [[-400, 15], [-460, 0], [-530, 5], [-590, 30], [-612, 58], [-598, 85], [-565, 100]]),
  // Neon Ward: from the town's west end south to the ward gate
  E('city-ramp', 'townW', 'cityGate', 'city', [[222, 935], [250, 990]]),
  // the avenue: east along the front block, hairpin round the far corner, back west
  E('city-avenue', 'cityGate', 'cityBack', 'city', [[350, 1040], [430, 1035], [500, 1050], [560, 1075], [592, 1100], [588, 1132], [556, 1148], [470, 1170], [400, 1182]]),
  // the alley back to the gate
  E('city-alley', 'cityBack', 'cityGate', 'city', [[300, 1150], [285, 1090]]),
]
