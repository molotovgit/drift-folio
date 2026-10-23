import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { lerp } from '../core/math'
import { ModelLibrary } from '../render/loadModel'
import { palette } from '../render/palette'
import { ToonMaterials } from '../render/toon'
import { surfaceOf } from '../vehicle/wheel'
import { RAIL_X, RAIL_Z, type Channel, type RailCrossing } from './shortcutLayout'

/** One train pass takes TRAIN_RUN seconds; the line is quiet for the rest of the cycle (plan 7.6: 45 s timer). */
export const TRAIN_PERIOD = 45
export const TRAIN_RUN = 22
/** booms come down when the train is this far from a crossing */
const BOOM_WARN = 140
const GAUGE = 1.067
/** loco + 3 wagons */
const CARS = [
  { model: 'train_loco', length: 14 },
  { model: 'train_wagon', length: 16 },
  { model: 'train_wagon', length: 16 },
  { model: 'train_wagon', length: 16 },
]

/** Where the train's head is (x along the line) at time t, or null when it isn't on the line. */
export function trainHeadX(t: number): number | null {
  const phase = ((t % TRAIN_PERIOD) + TRAIN_PERIOD) % TRAIN_PERIOD
  if (phase > TRAIN_RUN) return null
  // enters 40 m before the west end, leaves 70 m past the east end (full length clears)
  return lerp(RAIL_X.from - 40, RAIL_X.to + 70, phase / TRAIN_RUN)
}

/** Seconds until the train's head reaches x (Infinity if it won't this cycle). */
export function secondsUntilTrainAt(x: number, t: number): number {
  const phase = ((t % TRAIN_PERIOD) + TRAIN_PERIOD) % TRAIN_PERIOD
  const speed = (RAIL_X.to + 70 - (RAIL_X.from - 40)) / TRAIN_RUN
  const arrive = (x - (RAIL_X.from - 40)) / speed
  return arrive >= phase ? arrive - phase : arrive + TRAIN_PERIOD - phase
}

/**
 * S5's railway: track (sleepers + rails) along the carved rail bed, a crossing
 * barrier at every road crossing, and a freight train on a fixed timetable.
 * The train is a set of kinematic bodies tagged 'train' (hitting it is a crash).
 */
export class Railway {
  private readonly cars: { mesh: THREE.Object3D; body: RAPIER.RigidBody; length: number; offset: number }[] = []
  private readonly booms: { boom: THREE.Object3D; x: number }[] = []

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: RAPIER.World,
    private readonly bed: Channel,
    private readonly crossings: readonly RailCrossing[],
  ) {
    this.buildTrack()
  }

  /** Track height at x (follows the carved bed). */
  heightAt(x: number): number {
    const p = this.bed.points
    for (let i = 1; i < p.length; i++) if (p[i].x >= x) return lerp(p[i - 1].y, p[i].y, (x - p[i - 1].x) / (p[i].x - p[i - 1].x || 1))
    return p[p.length - 1].y
  }

  async build(): Promise<void> {
    const [barrier, ...carModels] = await Promise.all([ModelLibrary.load('crossing_barrier'), ...CARS.map((c) => ModelLibrary.load(c.model))])
    for (const c of this.crossings) {
      for (const side of [-1, 1]) {
        const b = barrier.clone(true)
        b.position.set(c.x - 6 * side, c.y, RAIL_Z + 5 * side)
        b.rotation.y = side > 0 ? 0 : Math.PI
        this.scene.add(b)
        const boom = b.getObjectByName('boom')
        if (boom) this.booms.push({ boom, x: c.x })
      }
    }
    let offset = 0
    CARS.forEach((c, i) => {
      const mesh = carModels[i].clone(true)
      this.scene.add(mesh)
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -500, RAIL_Z))
      const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(c.length / 2, 2, 1.5).setTranslation(0, 2, 0), body)
      surfaceOf.set(collider.handle, 'train')
      this.cars.push({ mesh, body, length: c.length, offset })
      offset += c.length + 1
    })
  }

  /** Move the train and booms for time t (seconds). */
  update(t: number): void {
    const head = trainHeadX(t)
    for (const car of this.cars) {
      const x = head === null ? null : head - car.offset - car.length / 2
      if (x === null || x < RAIL_X.from - 60 || x > RAIL_X.to + 60) {
        car.mesh.visible = false
        car.body.setNextKinematicTranslation({ x: 0, y: -500, z: RAIL_Z })
        continue
      }
      const y = this.heightAt(x)
      car.mesh.visible = true
      // models face +Z; the train runs along +X
      car.mesh.position.set(x, y, RAIL_Z)
      car.mesh.rotation.y = Math.PI / 2
      car.body.setNextKinematicTranslation({ x, y, z: RAIL_Z })
    }
    for (const b of this.booms) {
      const near = head !== null && Math.abs(head - b.x) < BOOM_WARN + 70
      // boom modelled lowered along −X; raise it by rotating about −Z (≈ 85°)
      const target = near ? 0 : -1.48
      b.boom.rotation.z = lerp(b.boom.rotation.z, target, 0.08)
    }
  }

  /** Sleepers (instanced) and two rails along the bed. */
  private buildTrack(): void {
    const pts = this.bed.points
    const sleepers: THREE.Matrix4[] = []
    for (let x = RAIL_X.from; x <= RAIL_X.to; x += 1.6) sleepers.push(new THREE.Matrix4().makeTranslation(x, this.heightAt(x) + 0.05, RAIL_Z))
    const sleeperMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.12, 2.4), ToonMaterials.create({ color: '#4a2c2a' }), sleepers.length)
    sleepers.forEach((m, i) => sleeperMesh.setMatrixAt(i, m))
    sleeperMesh.receiveShadow = true
    this.scene.add(sleeperMesh)
    const railMat = ToonMaterials.create({ color: palette.rail, flatShading: false })
    for (const side of [-1, 1]) {
      const path = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, p.y + 0.18, RAIL_Z + (side * GAUGE) / 2)))
      const rail = new THREE.Mesh(new THREE.TubeGeometry(path, pts.length * 2, 0.06, 4, false), railMat)
      this.scene.add(rail)
    }
  }
}
