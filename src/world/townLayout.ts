import type { Vec3 } from '../core/math'

/**
 * Base town (spec §6, plan M6): flat paved lots beside the town streets. All
 * positions are world metres; lots are discs the terrain is flattened under.
 */
export interface FlatLot {
  name: 'plaza' | 'skidpad' | 'gymkhana' | 'peak'
  x: number
  z: number
  r: number
  /** paved surface height */
  y: number
  /** the part that must stay dead flat (what is driven or stands on it); ramps to the streets stay outside it */
  usable?: Capsule
}

/** Points within `r` of the segment a–b (a disc when a = b). */
export interface Capsule {
  a: { x: number; z: number }
  b: { x: number; z: number }
  r: number
}

/** Horizontal distance from (x, z) to a capsule (0 inside). */
export function capsuleDistance(c: Capsule, x: number, z: number): number {
  const dx = c.b.x - c.a.x
  const dz = c.b.z - c.a.z
  const t = Math.max(0, Math.min(1, ((x - c.a.x) * dx + (z - c.a.z) * dz) / (dx * dx + dz * dz || 1)))
  return Math.max(0, Math.hypot(c.a.x + dx * t - x, c.a.z + dz * t - z) - c.r)
}

const disc = (x: number, z: number, r: number): Capsule => ({ a: { x, z }, b: { x, z }, r })

// heights sit level with the street each lot meets, so the ramps where they join stay small (LotSurface)
export const TOWN_LOTS: readonly FlatLot[] = [
  // main plaza in front of the pit garage, touching the town street at z ≈ 840
  // usable: the garage, tyre rack, link pads and bowling pins
  { name: 'plaza', x: 0, z: 884, r: 44, y: -117.1, usable: disc(0, 884, 32) },
  // skidpad lot with the donut ring, west of the plaza
  // usable: the painted ring (r ≈ 18 m) plus room to drift around it
  { name: 'skidpad', x: -96, z: 870, r: 31, y: -116.4, usable: disc(-96, 870, 24) },
  // gymkhana lot by the west street
  // usable: the cone course between its gates (see GYMKHANA)
  { name: 'gymkhana', x: 176, z: 884, r: 32, y: -117.45, usable: { a: { x: 150, z: 884 }, b: { x: 202, z: 884 }, r: 6 } },
]

export const lot = (name: FlatLot['name']): FlatLot => TOWN_LOTS.find((l) => l.name === name)!

/** Garage on the plaza's far side, open front facing the plaza centre (−Z). */
export const GARAGE = { x: 0, z: 919, yaw: Math.PI }

/** Skill tyre stacks along the plaza's east edge (stack i at z0 + i*spacing). */
export const TYRE_RACK = { x: 27, z0: 868, spacing: 5.5 }

/** Drive-on link pads along the plaza's west edge. */
export const LINK_PADS = { x: -26, z0: 876, spacing: 9, radius: 3.2 }

/** Tyre-bowling pins (pyramid) near the plaza entrance. */
export const BOWLING = { x: 0, z: 868 }

/** Gymkhana gates and a cone slalom between them along +X. */
export const GYMKHANA = {
  start: { x: 152, z: 884 },
  finish: { x: 202, z: 884 },
  gateRadius: 4.5,
  cones: [
    [160, 881], [166, 887], [172, 881], [178, 887], [184, 881], [190, 887], [196, 881],
  ] as [number, number][],
}

/** Six lanterns around the plaza; each lights when a shortcut is found (M7). */
export const LANTERNS: readonly Vec3[] = Array.from({ length: 6 }, (_, i) => {
  const a = Math.PI * (0.15 + (i / 5) * 0.7) // an arc on the plaza's south side
  return { x: Math.cos(a) * 40, y: 0, z: 884 - Math.sin(a) * 40 + 0 }
})
