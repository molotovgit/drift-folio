import type { CardId } from '../content/projects'
import type { Vec3 } from '../core/math'
import type { Telemetry } from '../vehicle/driftCar'

/** Extra distance beyond the radius the car must reach before a trigger re-arms. */
export const REARM_MARGIN = 5

/** Horizontal (x/z) distance: corners sit on slopes, the car's height must not matter. */
const flatDist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z)

// ---------------------------------------------------------------- apex triggers

export interface ApexDef {
  id: CardId
  pos: Vec3
  radius: number
}

export interface ApexResult {
  /** car drifted through this corner's apex: open the card */
  opened?: CardId
  /** car passed the apex without drifting: show "drift this corner" */
  hinted?: CardId
}

export interface ApexTriggers {
  update(t: Pick<Telemetry, 'pos' | 'drifting'>): ApexResult
}

interface ApexSlot {
  def: ApexDef
  /** fired in the current pass; cleared once the car is radius + margin away */
  opened: boolean
  hinted: boolean
}

/**
 * One open and at most one hint per pass. A hint can still be followed by an
 * open in the same pass (car starts drifting mid-corner); never the reverse.
 */
export function createApexTriggers(defs: readonly ApexDef[]): ApexTriggers {
  const slots: ApexSlot[] = defs.map((def) => ({ def, opened: false, hinted: false }))
  const none: ApexResult = Object.freeze({})

  return {
    update(t) {
      let result: ApexResult = none
      for (const s of slots) {
        const d = flatDist(t.pos, s.def.pos)
        if (d > s.def.radius + REARM_MARGIN) {
          s.opened = false
          s.hinted = false
          continue
        }
        if (d > s.def.radius || s.opened || result !== none) continue
        if (t.drifting) {
          s.opened = true
          result = { opened: s.def.id }
        } else if (!s.hinted) {
          s.hinted = true
          result = { hinted: s.def.id }
        }
      }
      return result
    },
  }
}

// ---------------------------------------------------------------- zone triggers

export type ZoneDef =
  | { name: string; box: { min: Vec3; max: Vec3 } }
  /** vertical cylinder: x/z distance only */
  | { name: string; circle: { center: Vec3; radius: number } }

export interface ZoneChanges {
  entered: readonly string[]
  left: readonly string[]
}

export interface ZoneTriggers {
  /** Zones entered and left since the previous call. */
  update(pos: Vec3): ZoneChanges
  /** Whether the last `update` position was inside `name`. */
  inside(name: string): boolean
}

function contains(z: ZoneDef, p: Vec3): boolean {
  if ('box' in z) {
    const { min, max } = z.box
    return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z
  }
  return flatDist(p, z.circle.center) <= z.circle.radius
}

/** Several defs may share a name; the zone is then their union. */
export function createZoneTriggers(defs: readonly ZoneDef[]): ZoneTriggers {
  const groups = new Map<string, ZoneDef[]>()
  for (const z of defs) {
    const g = groups.get(z.name)
    if (g) g.push(z)
    else groups.set(z.name, [z])
  }
  const current = new Set<string>()
  // Shared frozen result for the common "nothing changed" frame: no per-frame allocation.
  const empty: readonly string[] = Object.freeze([])
  const noChange: ZoneChanges = Object.freeze({ entered: empty, left: empty })

  return {
    update(pos) {
      let entered: string[] | null = null
      let left: string[] | null = null
      for (const [name, zones] of groups) {
        const now = zones.some((z) => contains(z, pos))
        if (now === current.has(name)) continue
        if (now) {
          current.add(name)
          ;(entered ??= []).push(name)
        } else {
          current.delete(name)
          ;(left ??= []).push(name)
        }
      }
      if (!entered && !left) return noChange
      return { entered: entered ?? empty, left: left ?? empty }
    },
    inside: (name) => current.has(name),
  }
}
