import * as THREE from 'three/webgpu'
import { palette } from '../render/palette'

/** Ember sparks drifting up around nearby lamps (spec §5 atmosphere; high tier only). */
export function createEmbers(scene: THREE.Scene, count = 90) {
  const geo = new THREE.PlaneGeometry(0.07, 0.07)
  const mat = new THREE.MeshBasicNodeMaterial({ color: palette.lampGlow, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.frustumCulled = false
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  scene.add(mesh)
  const p = new Float32Array(count * 3)
  const v = new Float32Array(count * 3)
  const a = new Float32Array(count).fill(99)
  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  let sources: THREE.Vector3[] = []
  return {
    mesh,
    /** world positions to spawn around (the light pool's active lamps) */
    setSources(s: THREE.Vector3[]) {
      sources = s
    },
    update(dt: number, camera: THREE.Camera) {
      for (let i = 0; i < count; i++) {
        a[i] += dt
        if (a[i] > 2.4) {
          const src = sources.length ? sources[i % sources.length] : null
          if (!src) {
            m.makeScale(0, 0, 0)
            mesh.setMatrixAt(i, m)
            continue
          }
          a[i] = Math.random() * 0.6
          p[i * 3] = src.x + (Math.random() - 0.5) * 1.5
          p[i * 3 + 1] = src.y - 0.4 + Math.random() * 0.4
          p[i * 3 + 2] = src.z + (Math.random() - 0.5) * 1.5
          v[i * 3] = (Math.random() - 0.5) * 0.6
          v[i * 3 + 1] = 0.4 + Math.random() * 0.6
          v[i * 3 + 2] = (Math.random() - 0.5) * 0.6
        }
        p[i * 3] += v[i * 3] * dt + Math.sin(a[i] * 6 + i) * 0.01
        p[i * 3 + 1] += v[i * 3 + 1] * dt
        p[i * 3 + 2] += v[i * 3 + 2] * dt
        pos.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2])
        m.compose(pos, camera.quaternion, one)
        mesh.setMatrixAt(i, m)
      }
      mesh.instanceMatrix.needsUpdate = true
    },
  }
}
