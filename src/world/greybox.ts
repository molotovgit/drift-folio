import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { palette } from '../render/palette'
import { surfaceOf } from '../vehicle/driftCar'

/** M1 test area: a 400 m tarmac pad with a cone slalom, a cone ring and a low wall. */
export function buildGreybox(scene: THREE.Scene, world: RAPIER.World) {
  const size = 400
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  const ground = world.createCollider(RAPIER.ColliderDesc.cuboid(size / 2, 0.5, size / 2).setTranslation(0, -0.5, 0).setFriction(0.9), groundBody)
  surfaceOf.set(ground.handle, 'road')

  const grid = document.createElement('canvas')
  grid.width = grid.height = 256
  const g = grid.getContext('2d')!
  g.fillStyle = palette.road
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = 'rgba(232,217,192,0.25)'
  g.lineWidth = 3
  g.strokeRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(grid)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(size / 10, size / 10)
  tex.colorSpace = THREE.SRGBColorSpace
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshToonMaterial({ map: tex }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const coneGeo = new THREE.ConeGeometry(0.22, 0.7, 10)
  coneGeo.translate(0, 0.35, 0)
  const coneMat = new THREE.MeshToonMaterial({ color: '#ff6a2a' })
  const cones: { mesh: THREE.Mesh; body: RAPIER.RigidBody }[] = []
  const addCone = (x: number, z: number) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 0.35, z))
    world.createCollider(RAPIER.ColliderDesc.cone(0.35, 0.22).setMass(3).setFriction(0.6), body)
    const mesh = new THREE.Mesh(coneGeo, coneMat)
    mesh.castShadow = true
    scene.add(mesh)
    cones.push({ mesh, body })
  }
  for (let i = 0; i < 8; i++) addCone(i % 2 ? 4 : -4, 40 + i * 18) // slalom ahead of the start
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    addCone(-60 + Math.cos(a) * 14, 60 + Math.sin(a) * 14) // donut ring
  }

  const wallMat = new THREE.MeshToonMaterial({ color: palette.rail })
  const addWall = (x: number, z: number, w: number, d: number) => {
    world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, 0.6, d / 2).setTranslation(x, 0.6, z).setFriction(0.2), groundBody)
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), wallMat)
    m.position.set(x, 0.6, z)
    m.castShadow = m.receiveShadow = true
    scene.add(m)
  }
  addWall(50, 120, 2, 80)
  addWall(0, 200, 120, 2)

  return {
    update() {
      for (const c of cones) {
        const p = c.body.translation()
        const q = c.body.rotation()
        c.mesh.position.set(p.x, p.y - 0.35, p.z)
        c.mesh.quaternion.set(q.x, q.y, q.z, q.w)
      }
    },
  }
}
