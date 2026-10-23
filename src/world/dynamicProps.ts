import RAPIER from '@dimforge/rapier3d-compat'
import type * as THREE from 'three/webgpu'
import type { Vec3 } from '../core/math'

interface DynamicProp {
  mesh: THREE.Object3D
  body: RAPIER.RigidBody
  home: Vec3
  /** mesh origin sits this far below the body's centre */
  meshOffsetY: number
}

/**
 * Small physics props the car can knock around (cones, bowling tyres).
 * Copies body transforms onto meshes each frame and reports which props have
 * been displaced from where they started.
 */
export class DynamicProps {
  private readonly props: DynamicProp[] = []

  constructor(
    private readonly world: RAPIER.World,
    private readonly scene: THREE.Scene,
  ) {}

  /** Add a prop whose collider is centred `halfHeight` above `at`. Returns its index. */
  add(mesh: THREE.Object3D, collider: RAPIER.ColliderDesc, at: Vec3, halfHeight: number, mass: number): number {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(at.x, at.y + halfHeight, at.z).setCanSleep(true))
    this.world.createCollider(collider.setMass(mass), body)
    this.scene.add(mesh)
    this.props.push({ mesh, body, home: { ...at }, meshOffsetY: halfHeight })
    this.sync()
    return this.props.length - 1
  }

  /** Copy physics transforms to meshes (call once per rendered frame). */
  sync(): void {
    for (const p of this.props) {
      const t = p.body.translation()
      const q = p.body.rotation()
      p.mesh.quaternion.set(q.x, q.y, q.z, q.w)
      p.mesh.position.set(t.x, t.y, t.z)
      p.mesh.translateY(-p.meshOffsetY)
    }
  }

  /** Has prop i moved more than `tolerance` metres from its starting spot (or fallen over)? */
  displaced(i: number, tolerance = 0.35): boolean {
    const p = this.props[i]
    const t = p.body.translation()
    const r = p.body.rotation()
    const upright = 1 - 2 * (r.x * r.x + r.z * r.z) // local up · world up
    return Math.hypot(t.x - p.home.x, t.z - p.home.z) > tolerance || upright < 0.7
  }

  /** Put prop i back where it started, upright and still. */
  reset(i: number): void {
    const p = this.props[i]
    p.body.setTranslation({ x: p.home.x, y: p.home.y + p.meshOffsetY, z: p.home.z }, true)
    p.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    p.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    p.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }

  get count(): number {
    return this.props.length
  }
}
