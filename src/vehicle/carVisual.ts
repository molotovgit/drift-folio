import * as THREE from 'three/webgpu'
import { loadModel } from '../render/loadModel'
import { palette } from '../render/palette'
import { carConfig } from './carConfig'
import type { DriftCar, Pose } from './driftCar'

export interface CarVisual {
  root: THREE.Object3D
  sync(car: DriftCar, pose: Pose): void
  setHeadlights(on: boolean): void
}

/** Physics wheel order: 0 front-left(+x,+z) 1 front-right 2 rear-left 3 rear-right. */
export function wheelSlot(x: number, z: number): number {
  return (z >= 0 ? 0 : 2) + (x >= 0 ? 0 : 1)
}

function makeVisual(body: THREE.Object3D, wheels: THREE.Object3D[], bodyYOffset: number): CarVisual {
  const root = new THREE.Group()
  const chassis = new THREE.Group()
  body.position.y = bodyYOffset
  chassis.add(body)
  root.add(chassis)
  for (const w of wheels) root.add(w)

  // headlight beams: cheap spot lights, no shadows
  const beams = [-0.55, 0.55].map((x) => {
    const s = new THREE.SpotLight(palette.headlight, 60, 45, 0.42, 0.55, 1.4)
    s.position.set(x, 0.25, 2.0)
    s.target.position.set(x * 1.5, -0.6, 14)
    chassis.add(s, s.target)
    return s
  })

  const q = new THREE.Quaternion()
  const yawQ = new THREE.Quaternion()
  const spinQ = new THREE.Quaternion()
  const X = new THREE.Vector3(1, 0, 0)
  const Y = new THREE.Vector3(0, 1, 0)
  return {
    root,
    setHeadlights(on) {
      beams.forEach((b) => (b.visible = on))
    },
    sync(car, pose) {
      chassis.position.set(pose.pos.x, pose.pos.y, pose.pos.z)
      chassis.quaternion.set(pose.rot.x, pose.rot.y, pose.rot.z, pose.rot.w)
      q.set(pose.rot.x, pose.rot.y, pose.rot.z, pose.rot.w)
      car.wheels().forEach((w, i) => {
        const m = wheels[i]
        const p = pose.wheels[i]
        if (!m || !p) return
        m.position.set(p.x, p.y, p.z)
        yawQ.setFromAxisAngle(Y, w.steerRad)
        spinQ.setFromAxisAngle(X, w.spin)
        m.quaternion.copy(q).multiply(yawQ).multiply(spinQ)
      })
    },
  }
}

/** Grey-box car: a teal box with four wheels. Used if fd.glb fails to load. */
export function createBoxCarVisual(): CarVisual {
  const body = new THREE.Group()
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.7, 4.28), new THREE.MeshToonMaterial({ color: palette.carTeal }))
  shell.position.y = 0.5
  shell.castShadow = true
  body.add(shell)
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.23, 14)
  wheelGeo.rotateZ(Math.PI / 2)
  const wheelMat = new THREE.MeshToonMaterial({ color: palette.ink })
  const wheels = [0, 1, 2, 3].map(() => new THREE.Mesh(wheelGeo, wheelMat))
  return makeVisual(body, wheels, -carConfig.comHeight)
}

/** The FD from public/models/fd.glb (toon materials, wheels re-parented to the world). */
export async function loadCarVisual(): Promise<CarVisual> {
  const template = await loadModel('fd')
  const model = template.clone(true)
  const wheels: THREE.Object3D[] = []
  const found: THREE.Object3D[] = []
  model.traverse((o) => {
    if (/^wheel_(fl|fr|rl|rr)$/.test(o.name)) found.push(o)
  })
  if (found.length !== 4) throw new Error(`fd.glb: expected 4 wheel nodes, found ${found.length}`)
  model.updateMatrixWorld(true)
  for (const w of found) {
    const wp = new THREE.Vector3()
    w.getWorldPosition(wp)
    const holder = new THREE.Group()
    w.removeFromParent()
    w.position.set(0, 0, 0)
    w.quaternion.identity()
    holder.add(w)
    wheels[wheelSlot(wp.x, wp.z)] = holder
  }
  return makeVisual(model, wheels, -carConfig.comHeight)
}
