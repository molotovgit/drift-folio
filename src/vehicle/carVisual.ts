import * as THREE from 'three/webgpu'
import { ModelLibrary } from '../render/loadModel'
import { palette } from '../render/palette'
import { carConfig } from './carConfig'
import type { DriftCar, Pose } from './driftCar'

/** Physics wheel order: 0 front-left(+x,+z) 1 front-right 2 rear-left 3 rear-right. */
export function wheelSlot(x: number, z: number): number {
  return (z >= 0 ? 0 : 2) + (x >= 0 ? 0 : 1)
}

const AXIS_X = new THREE.Vector3(1, 0, 0)
const AXIS_Y = new THREE.Vector3(0, 1, 0)

/**
 * Renders a DriftCar: a chassis that follows the interpolated body pose, four
 * wheels placed at the hubs (steer + spin), and two headlight beams.
 * Subclasses only decide which meshes to use.
 */
export abstract class CarVisual {
  readonly root = new THREE.Group()
  private readonly chassis = new THREE.Group()
  private readonly beams: THREE.SpotLight[]
  private readonly bodyQ = new THREE.Quaternion()
  private readonly yawQ = new THREE.Quaternion()
  private readonly spinQ = new THREE.Quaternion()

  protected constructor(
    body: THREE.Object3D,
    private readonly wheels: THREE.Object3D[],
  ) {
    // models sit with their origin on the ground; the physics body origin is the CoM
    body.position.y = -carConfig.comHeight
    this.chassis.add(body)
    this.root.add(this.chassis, ...wheels)
    // cheap spot lights, no shadows
    this.beams = [-0.55, 0.55].map((x) => {
      const s = new THREE.SpotLight(palette.headlight, 60, 45, 0.42, 0.55, 1.4)
      s.position.set(x, 0.25, 2.0)
      s.target.position.set(x * 1.5, -0.6, 14)
      this.chassis.add(s, s.target)
      return s
    })
  }

  setHeadlights(on: boolean): void {
    for (const b of this.beams) b.visible = on
  }

  /** Copy the interpolated pose onto the meshes. */
  sync(car: DriftCar, pose: Pose): void {
    this.chassis.position.set(pose.pos.x, pose.pos.y, pose.pos.z)
    this.chassis.quaternion.set(pose.rot.x, pose.rot.y, pose.rot.z, pose.rot.w)
    this.bodyQ.set(pose.rot.x, pose.rot.y, pose.rot.z, pose.rot.w)
    car.wheels().forEach((w, i) => {
      const mesh = this.wheels[i]
      const p = pose.wheels[i]
      if (!mesh || !p) return
      mesh.position.set(p.x, p.y, p.z)
      this.yawQ.setFromAxisAngle(AXIS_Y, w.steerRad)
      this.spinQ.setFromAxisAngle(AXIS_X, w.spin)
      mesh.quaternion.copy(this.bodyQ).multiply(this.yawQ).multiply(this.spinQ)
    })
  }
}

/** The FD from public/models/fd.glb (toon materials; wheels re-parented to the world). */
export class FdCarVisual extends CarVisual {
  private constructor(body: THREE.Object3D, wheels: THREE.Object3D[]) {
    super(body, wheels)
  }

  static async load(): Promise<FdCarVisual> {
    const model = (await ModelLibrary.load('fd')).clone(true)
    // exact names only: the loader splits multi-material wheels into children named wheel_fl_1 etc.
    const found: THREE.Object3D[] = []
    model.traverse((o: THREE.Object3D) => {
      if (/^wheel_(fl|fr|rl|rr)$/.test(o.name)) found.push(o)
    })
    if (found.length !== 4) throw new Error(`fd.glb: expected 4 wheel nodes, found ${found.length}`)
    model.updateMatrixWorld(true)
    const wheels: THREE.Object3D[] = []
    for (const w of found) {
      const at = w.getWorldPosition(new THREE.Vector3())
      const holder = new THREE.Group()
      w.removeFromParent()
      w.position.set(0, 0, 0)
      w.quaternion.identity()
      holder.add(w)
      wheels[wheelSlot(at.x, at.z)] = holder
    }
    return new FdCarVisual(model, wheels)
  }
}

/** Grey-box car used when fd.glb cannot load: a teal box with four wheels. */
export class BoxCarVisual extends CarVisual {
  constructor() {
    const body = new THREE.Group()
    const shell = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.7, 4.28), new THREE.MeshToonMaterial({ color: palette.carTeal }))
    shell.position.y = 0.5
    shell.castShadow = true
    body.add(shell)
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.23, 14)
    wheelGeo.rotateZ(Math.PI / 2)
    const wheelMat = new THREE.MeshToonMaterial({ color: palette.ink })
    super(body, [0, 1, 2, 3].map(() => new THREE.Mesh(wheelGeo, wheelMat)))
  }
}
