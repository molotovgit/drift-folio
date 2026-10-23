import * as THREE from 'three/webgpu'
import { palette } from '../render/palette'
import type { DriftCar } from './driftCar'

export interface CarVisual {
  root: THREE.Object3D
  sync(car: DriftCar): void
}

/** Grey-box car: a teal box with four wheels. Replaced by fd.glb in M2. */
export function createBoxCarVisual(): CarVisual {
  const root = new THREE.Group()
  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.7, 4.28), new THREE.MeshToonMaterial({ color: palette.carTeal }))
  bodyMesh.position.y = 0.05
  bodyMesh.castShadow = true
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 1.8), new THREE.MeshToonMaterial({ color: palette.carShadow }))
  cabin.position.set(0, 0.6, -0.2)
  root.add(bodyMesh, cabin)

  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.23, 14)
  wheelGeo.rotateZ(Math.PI / 2)
  const wheelMat = new THREE.MeshToonMaterial({ color: palette.ink })
  const wheels = [0, 1, 2, 3].map(() => {
    const m = new THREE.Mesh(wheelGeo, wheelMat)
    m.castShadow = true
    return m
  })
  const wheelRoot = new THREE.Group()
  wheelRoot.add(...wheels)

  const scene = new THREE.Group()
  scene.add(root, wheelRoot)
  const q = new THREE.Quaternion()
  const yawQ = new THREE.Quaternion()
  const spinQ = new THREE.Quaternion()
  const X = new THREE.Vector3(1, 0, 0)
  const Y = new THREE.Vector3(0, 1, 0)

  return {
    root: scene,
    sync(car) {
      const p = car.body.translation()
      const r = car.body.rotation()
      root.position.set(p.x, p.y, p.z)
      root.quaternion.set(r.x, r.y, r.z, r.w)
      q.set(r.x, r.y, r.z, r.w)
      car.wheels().forEach((w, i) => {
        const m = wheels[i]
        m.position.set(w.pos.x, w.pos.y, w.pos.z)
        yawQ.setFromAxisAngle(Y, w.steerRad)
        spinQ.setFromAxisAngle(X, w.spin)
        m.quaternion.copy(q).multiply(yawQ).multiply(spinQ)
      })
    },
  }
}
