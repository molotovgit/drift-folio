import { projects, routeNames, type CardId } from '../content/projects'
import { REGION_NAMES } from './regionLayout'
import { EDGE_DEFS } from './roadLayout'

/**
 * Where each project corner sits (spec §6/§7), as plain data: the road edge
 * and a preferred fraction of its length (cornerLayout finds the actual apex,
 * the tightest point within ±SEARCH metres or the entry's own `search`).
 *
 * Three corners per biome: one on each mountain descent, three in Lantern
 * Valley and three in Neon Ward. Placements only: each card's content (and
 * the route it is filed under) is unchanged. Kept free of rendering imports
 * so the UI can name a card's place (`placeName`).
 */
export const CORNERS: Readonly<Record<CardId, { edge: string; at: number; search?: number }>> = {
  // the mountain pass: one per descent
  C1: { edge: 'platform', at: 0.55 },
  C3: { edge: 'automation', at: 0.3 },
  C4: { edge: 'systems-a', at: 0.25 },
  // Lantern Valley
  // (short region roads bend more than once: a narrow search keeps each card on its own bend)
  C8: { edge: 'valley-descent', at: 0.56, search: 30 },
  C9: { edge: 'valley-paddies', at: 0.71, search: 40 },
  C5: { edge: 'valley-hairpin', at: 0.7, search: 40 },
  // Neon Ward
  C2: { edge: 'city-alley', at: 0.23, search: 30 },
  C6: { edge: 'city-avenue', at: 0.51, search: 60 },
  C7: { edge: 'city-alley', at: 0.5, search: 40 },
}

/**
 * The place name shown with a card (billboard, card panel, skip overlay):
 * the region's name when its corner is on a region road, otherwise the
 * mountain route the card is filed under.
 */
export function placeName(id: CardId): string {
  const route = EDGE_DEFS.find((e) => e.id === CORNERS[id].edge)?.route
  const region = route ? REGION_NAMES[route] : undefined
  return region ?? routeNames[projects.find((p) => p.id === id)!.route]
}
