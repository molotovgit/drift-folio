import { REGION_EDGE_DEFS, REGION_NODE_DEFS } from './regionLayout'

/**
 * The mountain's road layout (spec §6, sketch v0.4) as plain data.
 * World axes: the car leaves the summit heading +Z (downhill); +X is the
 * driver's left. Heights are metres (summit 0, town about -120).
 */
export type RoadRoute = 'summit' | 'automation' | 'platform' | 'systems' | 'systems-branch' | 'town' | 'return' | 'temple' | 'city'

export interface NodeDef {
  id: string
  x: number
  y: number
  z: number
}

export interface EdgeDef {
  id: string
  from: string
  to: string
  route: RoadRoute
  /** interior control points (x, z); the endpoint nodes are added automatically */
  ctrl: [number, number][]
}

export const ROAD_WIDTH = 8
/** centreline sample spacing, metres */
export const SAMPLE_SPACING = 2

const N = (id: string, x: number, y: number, z: number): NodeDef => ({ id, x, y, z })
const E = (id: string, from: string, to: string, route: RoadRoute, ctrl: [number, number][]): EdgeDef => ({ id, from, to, route, ctrl })

export const NODE_DEFS: readonly NodeDef[] = [
  N('summit', 0, 0, -30),
  N('fork1', 0, -5, 110),
  N('fork2', 0, -30, 300),
  N('join2', 0, -64, 520),
  N('sysBranchOut', -100, -58, 345),
  N('sysBranchIn', -112, -76, 470),
  N('townA', 140, -116, 820),
  N('townP', 0, -117, 840),
  N('townS', -150, -116, 820),
  N('townW', 230, -118, 880),
  // Lantern Valley and Neon Ward (regionLayout.ts)
  ...REGION_NODE_DEFS,
]

export const EDGE_DEFS: readonly EdgeDef[] = [
  E('summit', 'summit', 'fork1', 'summit', [[0, 20], [0, 70]]),
  // Automation Pass, west of the summit line (+X): long sweepers
  E('automation', 'fork1', 'townA', 'automation', [
    [40, 140], [130, 175], [200, 250], [205, 340], [150, 420], [140, 510], [200, 600], [215, 700], [180, 775],
  ]),
  // Platform Ridge: splits at Fork 2 and rejoins
  E('platform', 'fork1', 'fork2', 'platform', [[10, 170], [-15, 230]]),
  E('platform-w', 'fork2', 'join2', 'platform', [[45, 340], [70, 420], [40, 490]]),
  E('platform-e', 'fork2', 'join2', 'platform', [[-45, 340], [-70, 420], [-40, 490]]),
  E('platform-down', 'join2', 'townP', 'platform', [[30, 580], [75, 650], [20, 710], [-40, 760], [-30, 805]]),
  // Systems Drop, east (-X): tight hairpins down the steep face
  E('systems-a', 'fork1', 'sysBranchOut', 'systems', [[-40, 125], [-125, 145], [-152, 172], [-135, 202], [-82, 214], [-62, 245], [-90, 310]]),
  E('systems-b', 'sysBranchOut', 'sysBranchIn', 'systems', [[-82, 378], [-96, 408], [-150, 424], [-160, 452]]),
  E('systems-c', 'sysBranchIn', 'townS', 'systems', [[-90, 540], [-120, 660], [-150, 770]]),
  // side branch: the cluster yard loop (C6/C7)
  E('cluster', 'sysBranchOut', 'sysBranchIn', 'systems-branch', [[-150, 350], [-290, 365], [-330, 415], [-290, 465], [-175, 478]]),
  // base town street
  E('town-ap', 'townA', 'townP', 'town', [[90, 835]]),
  E('town-ps', 'townP', 'townS', 'town', [[-80, 835]]),
  E('town-aw', 'townA', 'townW', 'town', [[190, 850]]),
  // return road: from the town's west end around the outside of the mountain to the summit
  E('return', 'townW', 'summit', 'return', [
    [330, 860], [400, 760], [420, 620], [400, 480], [360, 340], [300, 210], [230, 100], [150, 10], [70, -50], [20, -60],
  ]),
  // Lantern Valley and Neon Ward (regionLayout.ts)
  ...REGION_EDGE_DEFS,
]

/** The descent a player drives on each themed route, Fork 1 → town (spec §6: 600–1000 m). */
export const DESCENT_EDGES = {
  automation: ['automation'],
  platform: ['platform', 'platform-w', 'platform-down'],
  systems: ['systems-a', 'systems-b', 'systems-c'],
} as const

export type DescentRoute = keyof typeof DESCENT_EDGES
