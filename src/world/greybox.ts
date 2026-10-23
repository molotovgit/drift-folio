import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { palette } from '../render/palette'
import { surfaceOf } from '../vehicle/wheel'

interface Cone {
  mesh: THREE.Mesh
  body: RAPIER.RigidBody
}

const PAD_SIZE = 400
const CONE_HALF_HEIGHT = 0.35

/** The M1 test area: a 400 m tarmac pad with a cone slalom, a cone ring and two low walls. */
export class Greybox {
  private readonly groundBody: RAPIER.RigidBody
  private readonly cones: Cone[] = []
  private readonly coneGeo = new THREE.ConeGeometry(0.22, 0.7, 10).translate(0, CONE_HALF_HEIGHT, 0)
  private readonly coneMat = new THREE.MeshToonMaterial({ color: '#ff6a2a' })
  private readonly wallMat = new THREE.MeshToonMaterial({ color: palette.rail })

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: RAPIER.World,
  ) {
    this.groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    const ground = world.createCollider(RAPIER.ColliderDesc.cuboid(PAD_SIZE / 2, 0.5, PAD_SIZE / 2).setTranslation(0, -0.5, 0).setFriction(0.9), this.groundBody)
    surfaceOf.set(ground.handle, 'road')
    scene.add(this.buildFloor())

    for (let i = 0; i < 8; i++) this.addCone(i % 2 ? 4 : -4, 40 + i * 18) // slalom ahead of the start
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      this.addCone(-60 + Math.cos(a) * 14, 60 + Math.sin(a) * 14) // donut ring
    }
    this.addWall(50, 120, 2, 80)
    this.addWall(0, 200, 120, 2)
  }

  /** Copy cone physics to their meshes. */
  update(): void {
    for (const c of this.cones) {
      const p = c.body.translation()
      const q = c.body.rotation()
      c.mesh.position.set(p.x, p.y - CONE_HALF_HEIGHT, p.z)
      c.mesh.quaternion.set(q.x, q.y, q.z, q.w)
    }
  }

  /** Tarmac with a faint 10 m grid so speed reads. */
  private buildFloor(): THREE.Mesh {
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
    tex.repeat.set(PAD_SIZE / 10, PAD_SIZE / 10)
    tex.colorSpace = THREE.SRGBColorSpace
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(PAD_SIZE, PAD_SIZE), new THREE.MeshToonMaterial({ map: tex }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    return floor
  }

  private addCone(x: number, z: number): void {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, CONE_HALF_HEIGHT, z))
    this.world.createCollider(RAPIER.ColliderDesc.cone(CONE_HALF_HEIGHT, 0.22).setMass(3).setFriction(0.6), body)
    const mesh = new THREE.Mesh(this.coneGeo, this.coneMat)
    mesh.castShadow = true
    this.scene.add(mesh)
    this.cones.push({ mesh, body })
  }

  private addWall(x: number, z: number, w: number, d: number): void {
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, 0.6, d / 2).setTranslation(x, 0.6, z).setFriction(0.2), this.groundBody)
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), this.wallMat)
    m.position.set(x, 0.6, z)
    m.castShadow = m.receiveShadow = true
    this.scene.add(m)
  }
}
