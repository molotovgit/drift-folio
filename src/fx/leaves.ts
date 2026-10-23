import * as THREE from 'three/webgpu'
import { palette } from '../render/palette'

interface Leaf {
  p: THREE.Vector3
  phase: number
  fall: number
  spin: THREE.Vector3
}

/** Autumn leaves drifting in a box around the camera (spec §5 atmosphere). One draw call. */
export class LeafSystem {
  readonly mesh: THREE.InstancedMesh
  private readonly leaves: Leaf[]
  private time = 0
  // scratch
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler()
  private static readonly ONE = new THREE.Vector3(1, 1, 1)

  constructor(
    scene: THREE.Scene,
    private readonly count = 220,
    /** half-size of the box around the camera that leaves wrap within, metres */
    private readonly radius = 28,
  ) {
    const geo = new THREE.PlaneGeometry(0.16, 0.12)
    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
    this.mesh = new THREE.InstancedMesh(geo, mat, count)
    this.mesh.frustumCulled = false
    const colours = [palette.foliageRed, palette.foliageOrange, palette.foliageAmber]
    const c = new THREE.Color()
    this.leaves = Array.from({ length: count }, (_, i) => {
      this.mesh.setColorAt(i, c.set(colours[i % 3]))
      return {
        p: new THREE.Vector3((Math.random() - 0.5) * radius * 2, Math.random() * 12, (Math.random() - 0.5) * radius * 2),
        phase: Math.random() * 10,
        fall: 0.6 + Math.random() * 0.7,
        spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(3),
      }
    })
    scene.add(this.mesh)
  }

  update(dt: number, centre: THREE.Vector3, wind: THREE.Vector3): void {
    this.time += dt
    const t = this.time
    for (let i = 0; i < this.count; i++) {
      const leaf = this.leaves[i]
      leaf.p.x += (wind.x + Math.sin(t * 1.3 + leaf.phase) * 0.6) * dt
      leaf.p.z += (wind.z + Math.cos(t * 1.1 + leaf.phase) * 0.6) * dt
      leaf.p.y -= leaf.fall * dt
      if (leaf.p.y < centre.y - 1) leaf.p.y = centre.y + 10 + Math.random() * 4
      leaf.p.x = this.wrap(leaf.p.x, centre.x)
      leaf.p.z = this.wrap(leaf.p.z, centre.z)
      const a = t + leaf.phase
      this.e.set(leaf.spin.x * a, leaf.spin.y * a, leaf.spin.z * a)
      this.q.setFromEuler(this.e)
      this.m.compose(leaf.p, this.q, LeafSystem.ONE)
      this.mesh.setMatrixAt(i, this.m)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  /** Keep a coordinate within ±radius of the centre by wrapping to the other side. */
  private wrap(v: number, centre: number): number {
    const d = v - centre
    return d > this.radius ? v - this.radius * 2 : d < -this.radius ? v + this.radius * 2 : v
  }
}
