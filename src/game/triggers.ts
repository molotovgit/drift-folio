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

interface ApexSlot {
  def: ApexDef
  /** fired in the current pass; cleared once the car is radius + margin away */
  opened: boolean
  hinted: boolean
}

/**
 * One trigger per project corner. One open and at most one hint per pass. A
 * hint can still be followed by an open in the same pass (car starts drifting
 * mid-corner); never the reverse.
 */
export class ApexTriggers {
  private static readonly NONE: ApexResult = Object.freeze({})
  private readonly slots: ApexSlot[]

  constructor(defs: readonly ApexDef[]) {
    this.slots = defs.map((def) => ({ def, opened: false, hinted: false }))
  }

  /** Call once per frame; returns at most one opened or hinted corner. */
  update(t: Pick<Telemetry, 'pos' | 'drifting'>): ApexResult {
    let result = ApexTriggers.NONE
    for (const s of this.slots) {
      const d = flatDist(t.pos, s.def.pos)
      if (d > s.def.radius + REARM_MARGIN) {
        s.opened = false
        s.hinted = false
        continue
      }
      if (d > s.def.radius || s.opened || result !== ApexTriggers.NONE) continue
      if (t.drifting) {
        s.opened = true
        result = { opened: s.def.id }
      } else if (!s.hinted) {
        s.hinted = true
        result = { hinted: s.def.id }
      }
    }
    return result
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

/**
 * Named zones (pit box, town, S2 riverbed…). Several defs may share a name;
 * the zone is then their union.
 */
export class ZoneTriggers {
  // shared frozen result for the common "nothing changed" frame: no per-frame allocation
  private static readonly EMPTY: readonly string[] = Object.freeze([])
  private static readonly NO_CHANGE: ZoneChanges = Object.freeze({ entered: ZoneTriggers.EMPTY, left: ZoneTriggers.EMPTY })

  private readonly groups = new Map<string, ZoneDef[]>()
  private readonly current = new Set<string>()

  constructor(defs: readonly ZoneDef[]) {
    for (const z of defs) {
      const g = this.groups.get(z.name)
      if (g) g.push(z)
      else this.groups.set(z.name, [z])
    }
  }

  /** Zones entered and left since the previous call. */
  update(pos: Vec3): ZoneChanges {
    let entered: string[] | null = null
    let left: string[] | null = null
    for (const [name, zones] of this.groups) {
      const now = zones.some((z) => ZoneTriggers.contains(z, pos))
      if (now === this.current.has(name)) continue
      if (now) {
        this.current.add(name)
        ;(entered ??= []).push(name)
      } else {
        this.current.delete(name)
        ;(left ??= []).push(name)
      }
    }
    if (!entered && !left) return ZoneTriggers.NO_CHANGE
    return { entered: entered ?? ZoneTriggers.EMPTY, left: left ?? ZoneTriggers.EMPTY }
  }

  /** Whether the last `update` position was inside `name`. */
  inside(name: string): boolean {
    return this.current.has(name)
  }

  private static contains(z: ZoneDef, p: Vec3): boolean {
    if ('box' in z) {
      const { min, max } = z.box
      return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z
    }
    return flatDist(p, z.circle.center) <= z.circle.radius
  }
}
