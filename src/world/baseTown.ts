import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { about } from '../content/projects'
import type { Vec3 } from '../core/math'
import { GymkhanaTimer, type GymkhanaEvent } from '../game/gymkhana'
import { ZoneTriggers } from '../game/triggers'
import { ModelLibrary } from '../render/loadModel'
import { ToonMaterials } from '../render/toon'
import type { SafeStorage } from '../util/storage'
import { surfaceOf } from '../vehicle/wheel'
import { DynamicProps } from './dynamicProps'
import { BOWLING, GARAGE, GYMKHANA, LANTERNS, LINK_PADS, lot, TOWN_LOTS, TYRE_RACK, type FlatLot } from './townLayout'
import { TownTextures } from './townTextures'

const TYRE_HEIGHT = 0.23
const MAX_STACK = 8

/** What happened in town this frame (the game turns these into HUD hints and actions). */
export interface TownEvents {
  /** the car is on this link pad (null when on none) */
  pad: { label: string; url: string } | null
  enteredLot?: FlatLot['name']
  gymkhana?: GymkhanaEvent
}

/**
 * The base town (plan M6): paved lots (plaza, skidpad, gymkhana) that count as
 * road, the pit garage with the README line on its wall, a skills tyre rack,
 * drive-on link pads, tyre bowling, a timed cone gymkhana and six lanterns.
 */
export class BaseTown {
  readonly gymkhana: GymkhanaTimer
  private readonly physics: DynamicProps
  private readonly zones: ZoneTriggers
  private readonly coneIdx: number[] = []
  private readonly coneHit = new Set<number>()
  private readonly lanternMats: THREE.MeshToonNodeMaterial[] = []
  private readonly pads = about.links.map((l, i) => ({ ...l, x: LINK_PADS.x, z: LINK_PADS.z0 + i * LINK_PADS.spacing }))

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: RAPIER.World,
    storage: SafeStorage,
  ) {
    this.gymkhana = new GymkhanaTimer(storage)
    this.physics = new DynamicProps(world, scene)
    const g = lot('gymkhana')
    this.zones = new ZoneTriggers([
      ...TOWN_LOTS.map((l) => ({ name: l.name, circle: { center: { x: l.x, y: l.y, z: l.z }, radius: l.r } })),
      ...this.pads.map((p) => ({ name: `pad:${p.label}`, circle: { center: { x: p.x, y: 0, z: p.z }, radius: LINK_PADS.radius } })),
      { name: 'gym-start', circle: { center: { x: GYMKHANA.start.x, y: g.y, z: GYMKHANA.start.z }, radius: GYMKHANA.gateRadius } },
      { name: 'gym-finish', circle: { center: { x: GYMKHANA.finish.x, y: g.y, z: GYMKHANA.finish.z }, radius: GYMKHANA.gateRadius } },
    ])
    this.buildLots()
    this.buildPads()
  }

  /** Load glTF props (garage, tyres, cones, lanterns). */
  async build(): Promise<void> {
    const [garage, tyre, cone, lantern] = await Promise.all(['garage', 'tyre', 'cone', 'paper_lantern'].map((m) => ModelLibrary.load(m)))
    this.placeGarage(garage)
    this.placeTyreRack(tyre)
    this.placeBowling(tyre)
    this.placeGymkhana(cone)
    this.placeLanterns(lantern)
  }

  /** Per frame: physics prop sync, zones, gymkhana timing. */
  update(pos: Vec3, now: number): TownEvents {
    this.physics.sync()
    const { entered, left } = this.zones.update(pos)
    const events: TownEvents = { pad: this.currentPad() }
    events.enteredLot = entered.find((n): n is FlatLot['name'] => n === 'plaza' || n === 'skidpad' || n === 'gymkhana')
    if (entered.includes('gym-start')) events.gymkhana = this.startGymkhana(now) ?? undefined
    else if (entered.includes('gym-finish')) events.gymkhana = this.gymkhana.finishGate(now) ?? undefined
    else if (left.includes('gymkhana')) events.gymkhana = this.gymkhana.abort() ?? undefined
    if (this.gymkhana.running) {
      for (const i of this.coneIdx) {
        if (!this.coneHit.has(i) && this.physics.displaced(i)) {
          this.coneHit.add(i)
          events.gymkhana = this.gymkhana.coneHit() ?? events.gymkhana
        }
      }
    }
    return events
  }

  /** Light lantern i (0..5) when its shortcut is discovered (M7). */
  lightLantern(i: number): void {
    const m = this.lanternMats[i]
    if (m) m.emissiveIntensity = 2.6
  }

  private currentPad(): TownEvents['pad'] {
    const p = this.pads.find((p) => this.zones.inside(`pad:${p.label}`))
    return p ? { label: p.label, url: p.url } : null
  }

  private startGymkhana(now: number): GymkhanaEvent | null {
    // fresh course for every run
    for (const i of this.coneIdx) this.physics.reset(i)
    this.coneHit.clear()
    return this.gymkhana.startGate(now)
  }

  /** Paved discs with 'road' colliders so driving on them never counts as off-road. */
  private buildLots(): void {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    for (const l of TOWN_LOTS) {
      const map = l.name === 'skidpad' ? TownTextures.skidpad() : TownTextures.concrete()
      if (l.name !== 'skidpad') map.repeat.set(l.r / 4, l.r / 4)
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(l.r, 64), ToonMaterials.create({ color: '#ffffff', map, flatShading: false }))
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(l.x, l.y + 0.01, l.z)
      mesh.receiveShadow = true
      this.scene.add(mesh)
      const collider = this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.25, l.r).setTranslation(l.x, l.y - 0.25, l.z).setFriction(0.9), body)
      surfaceOf.set(collider.handle, 'road')
    }
  }

  private buildPads(): void {
    const y = lot('plaza').y + 0.03
    for (const p of this.pads) {
      const mat = ToonMaterials.create({ color: '#ffffff', map: TownTextures.pad(p.label), transparent: true, flatShading: false })
      mat.emissive = new THREE.Color('#ffffff')
      mat.emissiveIntensity = 0.25
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(LINK_PADS.radius, 48), mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(p.x, y, p.z)
      this.scene.add(mesh)
    }
  }

  private placeGarage(template: THREE.Group): void {
    const garage = template.clone(true)
    garage.position.set(GARAGE.x, lot('plaza').y, GARAGE.z)
    garage.rotation.y = GARAGE.yaw
    const wallMat = ToonMaterials.create({ color: '#ffffff', map: TownTextures.pitWall(), flatShading: false, bands: 2 })
    garage.traverse((o) => {
      if (o.name === 'pit_wall' && (o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = wallMat
    })
    this.scene.add(garage)
    // the garage is solid: a box collider for the back and sides (open front)
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(GARAGE.x, lot('plaza').y, GARAGE.z))
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(6.2, 2.5, 0.3).setTranslation(0, 2.5, 4.6), body)
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 2.5, 4.6).setTranslation(6.1, 2.5, 0), body)
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 2.5, 4.6).setTranslation(-6.1, 2.5, 0), body)
  }

  /** Skills as tyre stacks: height = how much the skill is used (spec §7). */
  private placeTyreRack(tyre: THREE.Group): void {
    const y0 = lot('plaza').y
    about.skills.forEach((s, i) => {
      const z = TYRE_RACK.z0 + i * TYRE_RACK.spacing
      const count = Math.max(1, Math.round(s.level * MAX_STACK))
      for (let k = 0; k < count; k++) {
        const t = tyre.clone(true)
        t.position.set(TYRE_RACK.x, y0 + k * TYRE_HEIGHT, z)
        this.scene.add(t)
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.8), ToonMaterials.create({ color: '#ffffff', map: TownTextures.label(s.name), side: THREE.DoubleSide, flatShading: false }))
      sign.position.set(TYRE_RACK.x, y0 + count * TYRE_HEIGHT + 0.7, z)
      sign.rotation.y = -Math.PI / 2 // face the plaza centre (−X)
      this.scene.add(sign)
    })
  }

  /** A 4-3-2-1 pyramid of loose tyres to drive through. */
  private placeBowling(tyre: THREE.Group): void {
    const y0 = lot('plaza').y
    let row = 0
    for (const n of [4, 3, 2, 1]) {
      for (let k = 0; k < n; k++) {
        const x = BOWLING.x + (k - (n - 1) / 2) * 0.7
        const mesh = tyre.clone(true)
        this.physics.add(mesh, RAPIER.ColliderDesc.cylinder(TYRE_HEIGHT / 2, 0.32).setFriction(0.8), { x, y: y0 + row * TYRE_HEIGHT, z: BOWLING.z }, TYRE_HEIGHT / 2, 9)
      }
      row++
    }
  }

  private placeGymkhana(cone: THREE.Group): void {
    const y0 = lot('gymkhana').y
    for (const [x, z] of GYMKHANA.cones) {
      this.coneIdx.push(this.physics.add(cone.clone(true), RAPIER.ColliderDesc.cone(0.35, 0.22).setFriction(0.6), { x, y: y0, z }, 0.35, 3))
    }
    // gate posts: two static cones either side of each gate
    for (const gate of [GYMKHANA.start, GYMKHANA.finish]) {
      for (const dz of [-GYMKHANA.gateRadius, GYMKHANA.gateRadius]) {
        const post = cone.clone(true)
        post.scale.setScalar(1.6)
        post.position.set(gate.x, y0, gate.z + dz)
        this.scene.add(post)
      }
    }
  }

  /** Six unlit lanterns on posts around the plaza; each lights when its shortcut is found. */
  private placeLanterns(lantern: THREE.Group): void {
    const y0 = lot('plaza').y
    const postGeo = new THREE.CylinderGeometry(0.07, 0.09, 3.2, 8).translate(0, 1.6, 0)
    const postMat = ToonMaterials.create({ color: '#4a2c2a' })
    for (const p of LANTERNS) {
      const post = new THREE.Mesh(postGeo, postMat)
      post.position.set(p.x, y0, p.z)
      const l = lantern.clone(true)
      l.position.set(p.x, y0 + 3.1, p.z)
      // each lantern gets its own material so it can light independently
      const mat = ToonMaterials.create({ color: '#ffcf7a', flatShading: false })
      mat.emissive = new THREE.Color('#ffb35a')
      mat.emissiveIntensity = 0.05
      l.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat
      })
      this.lanternMats.push(mat)
      this.scene.add(post, l)
    }
  }
}
