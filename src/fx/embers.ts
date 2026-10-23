import * as THREE from 'three/webgpu'
import { palette } from '../render/palette'

const EMBER_LIFE = 2.4

/** Ember sparks drifting up around nearby lit lamps (spec §5 atmosphere; high tier only). */
export class EmberSystem {
  readonly mesh: THREE.InstancedMesh
  private readonly pos: Float32Array
  private readonly vel: Float32Array
  private readonly age: Float32Array
  private sources: readonly THREE.Vector3[] = []
  // scratch
  private readonly m = new THREE.Matrix4()
  private readonly p = new THREE.Vector3()
  private static readonly ONE = new THREE.Vector3(1, 1, 1)

  constructor(
    scene: THREE.Scene,
    private readonly count = 90,
  ) {
    const geo = new THREE.PlaneGeometry(0.07, 0.07)
    const mat = new THREE.MeshBasicNodeMaterial({ color: palette.lampGlow, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })
    this.mesh = new THREE.InstancedMesh(geo, mat, count)
    this.mesh.frustumCulled = false
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    scene.add(this.mesh)
    this.pos = new Float32Array(count * 3)
    this.vel = new Float32Array(count * 3)
    this.age = new Float32Array(count).fill(99)
  }

  /** World positions to spawn around (the light pool's active lamps; array is read, not copied). */
  setSources(sources: readonly THREE.Vector3[]): void {
    this.sources = sources
  }

  update(dt: number, camera: THREE.Camera): void {
    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt
      if (this.age[i] > EMBER_LIFE && !this.respawn(i)) {
        this.m.makeScale(0, 0, 0)
        this.mesh.setMatrixAt(i, this.m)
        continue
      }
      // rise with a little flutter
      this.pos[i * 3] += this.vel[i * 3] * dt + Math.sin(this.age[i] * 6 + i) * 0.01
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      this.p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2])
      this.m.compose(this.p, camera.quaternion, EmberSystem.ONE)
      this.mesh.setMatrixAt(i, this.m)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  /** Restart ember i at a random lamp; false when there are no lamps nearby. */
  private respawn(i: number): boolean {
    if (!this.sources.length) return false
    const src = this.sources[i % this.sources.length]
    this.age[i] = Math.random() * 0.6
    this.pos[i * 3] = src.x + (Math.random() - 0.5) * 1.5
    this.pos[i * 3 + 1] = src.y - 0.4 + Math.random() * 0.4
    this.pos[i * 3 + 2] = src.z + (Math.random() - 0.5) * 1.5
    this.vel[i * 3] = (Math.random() - 0.5) * 0.6
    this.vel[i * 3 + 1] = 0.4 + Math.random() * 0.6
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.6
    return true
  }
}
