import * as THREE from 'three/webgpu'
import { ToonMaterials } from '../render/toon'
import type { Telemetry } from '../vehicle/driftCar'
import { signTexture } from './projectCorners'
import type { RoadNetwork } from './roadNetwork'

/** Junctions that carry a signpost. */
export type ForkId = 'fork1' | 'fork2'

/**
 * Board labels per fork, indexed like the model's boards: sign_0 points -X,
 * sign_1 points +X, sign_2 points back-left (tools/blender/props/signpost.py).
 * With the road running +Z, +X is left: Automation Pass and Ridge West go
 * that way, Systems Drop and Ridge East the other.
 */
export const SIGN_LABELS: Record<ForkId, readonly [string, string, string]> = {
  fork1: ['SYSTEMS DROP', 'AUTOMATION PASS', 'PLATFORM RIDGE'],
  fork2: ['RIDGE EAST', 'RIDGE WEST', 'BASE TOWN'],
}

/** Boards light up when the car is this close to the fork... */
export const SIGN_RANGE = 45
/** ...and slower than this (m/s): reading the signs, not racing past. */
export const SIGN_SLOW = 12
const LIT = 0.85
const UNLIT = 0.1

/**
 * The route signposts at Fork 1 and Fork 2. Each fork has one set of three
 * board materials shared by every signpost there; the set glows while the car
 * is near the fork and slow.
 */
export class Signposts {
  private readonly forks: { id: ForkId; x: number; z: number }[]
  private readonly mats = new Map<ForkId, THREE.MeshToonNodeMaterial[]>()
  private litFork: ForkId | null = null

  constructor(roads: RoadNetwork) {
    this.forks = (['fork1', 'fork2'] as const).map((id) => ({ id, x: roads.node(id).pos.x, z: roads.node(id).pos.z }))
  }

  /** Fork whose signs are lit right now, or null. */
  get lit(): ForkId | null {
    return this.litFork
  }

  /** Nearest fork to (x, z). */
  forkAt(x: number, z: number): ForkId {
    let best = this.forks[0]
    for (const f of this.forks) if (Math.hypot(f.x - x, f.z - z) < Math.hypot(best.x - x, best.z - z)) best = f
    return best.id
  }

  /** Fork the signs should light for, given the car's position and speed. */
  litFor(t: Pick<Telemetry, 'pos' | 'speed'>): ForkId | null {
    if (!(t.speed < SIGN_SLOW)) return null
    const id = this.forkAt(t.pos.x, t.pos.z)
    const f = this.forks.find((k) => k.id === id)!
    return Math.hypot(f.x - t.pos.x, f.z - t.pos.z) <= SIGN_RANGE ? id : null
  }

  /** Paint the boards of every signpost in `group` (a landmark group) with its fork's labels. */
  label(group: THREE.Object3D): void {
    for (const post of group.children) {
      if (!post.getObjectByName('sign_0')) continue
      const boards = this.materials(this.forkAt(post.position.x, post.position.z))
      post.traverse((o) => {
        const m = /^sign_(\d)$/.exec(o.name)
        if (m && (o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = boards[Number(m[1])] ?? boards[0]
      })
    }
  }

  /** Per frame: light the boards of the fork the car is idling at. */
  update(t: Pick<Telemetry, 'pos' | 'speed'>): void {
    const next = this.litFor(t)
    if (next === this.litFork) return
    this.setGlow(this.litFork, UNLIT)
    this.setGlow(next, LIT)
    this.litFork = next
  }

  private setGlow(id: ForkId | null, intensity: number): void {
    if (!id) return
    for (const m of this.mats.get(id) ?? []) m.emissiveIntensity = intensity
  }

  /** The fork's three board materials, built once and shared. */
  private materials(id: ForkId): THREE.MeshToonNodeMaterial[] {
    let set = this.mats.get(id)
    if (!set) {
      set = SIGN_LABELS[id].map((label) => {
        const m = ToonMaterials.create({ color: '#ffffff', map: signTexture(label), flatShading: false, bands: 2 })
        // the board's own face glows, so the lettering stays readable when lit
        m.emissive = new THREE.Color('#ffffff')
        m.emissiveMap = m.map
        m.emissiveIntensity = UNLIT
        return m
      })
      this.mats.set(id, set)
    }
    return set
  }
}
