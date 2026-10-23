import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import type { Vec3 } from '../core/math'
import type { ShortcutId } from '../game/discovery'
import { ModelLibrary } from '../render/loadModel'
import type { Telemetry } from '../vehicle/driftCar'
import { surfaceOf } from '../vehicle/wheel'
import { PavedPath } from './pavedPath'
import { Railway, secondsUntilTrainAt } from './railway'
import type { RoadNetwork } from './roadNetwork'
import { brokenRailChute, channelDistance, PEAK, peakTrail, railBed, railCrossings, RAIL_Z, restStopCut, riverbed, type Channel } from './shortcutLayout'

/** Airborne this long near the ramp counts as taking the jump. */
const JUMP_AIR_SECONDS = 0.45
/** crossing the tracks with the train this close counts as beating it */
const TRAIN_BEAT_SECONDS = 4
const SECRET_CAR_RADIUS = 4

export interface ShortcutEvents {
  /** newly found shortcut this frame */
  found?: ShortcutId
  /** the car drove into the secret car at the peak */
  secretCar?: boolean
  /** off-road driving is allowed here (dirt shortcuts) */
  inDirt: boolean
}

/**
 * The six shortcuts (spec §6, plan M7): S1 jump ramp, S2 dry riverbed, S3
 * broken rail chute, S4 rest-stop cut, S5 beat the train, S6 hidden peak.
 * Builds their props and detects when each is taken.
 */
export class Shortcuts {
  readonly railway: Railway
  /** the rail gap S3 needs (passed to GuardRails) */
  static gaps(roads: RoadNetwork): { x: number; z: number; r: number }[] {
    const top = brokenRailChute(roads).points[0]
    return [{ x: top.x, z: top.z, r: 10 }]
  }

  private readonly dirt: Channel[]
  private readonly cut: Channel
  private readonly ramp: { pos: Vec3; yaw: number }
  private airFor = 0
  private prevZ: number | null = null
  private barrier: { mesh: THREE.Object3D | null; collider: RAPIER.Collider } | null = null
  private secretCarTaken = false

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: RAPIER.World,
    private readonly roads: RoadNetwork,
  ) {
    this.dirt = [riverbed(roads), brokenRailChute(roads), peakTrail(roads)]
    this.cut = restStopCut(roads)
    scene.add(new PavedPath(world, this.cut, roads).mesh)
    this.railway = new Railway(scene, world, railBed(roads), railCrossings(roads))
    this.ramp = this.rampSpot()
    this.buildRampCollider()
    this.buildPeakBarrier()
  }

  /** Load the glTF props (ramp, fence, shrine, secret car, train). */
  async build(): Promise<void> {
    const [ramp, fence, shrine, car] = await Promise.all(['ramp', 'fence_segment', 'shrine', 'fd'].map((m) => ModelLibrary.load(m)))
    const r = ramp.clone(true)
    r.position.set(this.ramp.pos.x, this.ramp.pos.y, this.ramp.pos.z)
    r.rotation.y = this.ramp.yaw
    this.scene.add(r)
    if (this.barrier) {
      const f = fence.clone(true)
      const start = peakTrail(this.roads).points[2]
      f.position.set(start.x, start.y, start.z)
      f.rotation.y = Math.PI / 4
      this.scene.add(f)
      this.barrier.mesh = f
    }
    const s = shrine.clone(true)
    s.position.set(PEAK.x - 5, PEAK.y, PEAK.z - 6)
    this.scene.add(s)
    this.scene.add(Shortcuts.secretCar(car))
    await this.railway.build()
  }

  /** Off-road driving is allowed inside the dirt shortcuts. */
  inDirt(pos: Vec3): boolean {
    return this.dirt.some((c) => channelDistance(c, pos.x, pos.z).dist < c.width / 2 + 3)
  }

  /** Remove the barrier at the foot of the peak trail (after the ghost is beaten). */
  openPeak(): void {
    if (!this.barrier) return
    this.world.removeCollider(this.barrier.collider, false)
    if (this.barrier.mesh) this.barrier.mesh.visible = false
    this.barrier = null
  }

  get peakOpen(): boolean {
    return this.barrier === null
  }

  update(t: Telemetry, dt: number, now: number): ShortcutEvents {
    this.railway.update(now)
    const ev: ShortcutEvents = { inDirt: this.inDirt(t.pos) }
    ev.found = this.detect(t, dt, now)
    if (!this.secretCarTaken && Math.hypot(t.pos.x - PEAK.x, t.pos.z - PEAK.z) < SECRET_CAR_RADIUS) {
      this.secretCarTaken = true
      ev.secretCar = true
    }
    this.prevZ = t.pos.z
    return ev
  }

  private detect(t: Telemetry, dt: number, now: number): ShortcutId | undefined {
    // S1: airborne off the ramp
    const nearRamp = Math.hypot(t.pos.x - this.ramp.pos.x, t.pos.z - this.ramp.pos.z) < 90
    this.airFor = nearRamp && t.wheelsOnGround === 0 ? this.airFor + dt : 0
    if (this.airFor >= JUMP_AIR_SECONDS) return 'S1'
    // S2, S3, S4: driving through the middle third of the path
    const [river, chute] = this.dirt
    if (this.midway(river, t.pos)) return 'S2'
    if (this.midway(chute, t.pos)) return 'S3'
    if (this.midway(this.cut, t.pos)) return 'S4'
    // S5: crossing the tracks just ahead of the train
    if (this.prevZ !== null && (this.prevZ - RAIL_Z) * (t.pos.z - RAIL_Z) < 0 && secondsUntilTrainAt(t.pos.x, now) < TRAIN_BEAT_SECONDS) return 'S5'
    // S6: standing on the peak
    if (Math.hypot(t.pos.x - PEAK.x, t.pos.z - PEAK.z) < PEAK.r && t.pos.y > PEAK.y - 3) return 'S6'
    return undefined
  }

  private midway(c: Channel, pos: Vec3): boolean {
    const { dist, frac } = channelDistance(c, pos.x, pos.z)
    return dist < c.width / 2 + 1 && frac > 0.35 && frac < 0.65
  }

  /** S1 ramp: on Systems Drop, 56 m before the first hairpin, along the road. */
  private rampSpot(): { pos: Vec3; yaw: number } {
    const e = this.roads.edge('systems-a')
    const apex = e.hairpinApexes()[0] ?? Math.floor(e.points.length / 3)
    const i = Math.max(4, apex - 28)
    const t = e.tangent(i)
    return { pos: { ...e.points[i] }, yaw: Math.atan2(t.x, t.y) }
  }

  /** Wedge collider matching the ramp model: 6 m long, 4 m wide, rising to 1.4 m along +Z. */
  private buildRampCollider(): void {
    const pts = new Float32Array([-2, 0, -3, 2, 0, -3, -2, 0, 3, 2, 0, 3, -2, 1.4, 3, 2, 1.4, 3])
    const desc = RAPIER.ColliderDesc.convexHull(pts)!
      .setTranslation(this.ramp.pos.x, this.ramp.pos.y, this.ramp.pos.z)
      .setRotation({ x: 0, y: Math.sin(this.ramp.yaw / 2), z: 0, w: Math.cos(this.ramp.yaw / 2) })
    const c = this.world.createCollider(desc)
    surfaceOf.set(c.handle, 'road')
  }

  /** S6 starts closed: a fence across the trail until the ghost lap is beaten. */
  private buildPeakBarrier(): void {
    const p = peakTrail(this.roads).points[2]
    const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(4, 1, 0.3).setTranslation(p.x, p.y + 1, p.z).setRotation({ x: 0, y: Math.sin(Math.PI / 8), z: 0, w: Math.cos(Math.PI / 8) }))
    this.barrier = { mesh: null, collider }
  }

  /** The secret car on the peak: the FD in a gold-on-magenta livery. */
  private static secretCar(template: THREE.Group): THREE.Object3D {
    const car = template.clone(true)
    car.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshToonNodeMaterial
      if (mat.name === 'paint') {
        const gold = mat.clone()
        gold.color = new THREE.Color('#ffc04d')
        mesh.material = gold
      }
    })
    car.position.set(PEAK.x + 3, PEAK.y, PEAK.z)
    car.rotation.y = 0.8
    return car
  }
}
