import * as THREE from 'three/webgpu'
import { palette } from '../render/palette'

/** Autumn leaves drifting around the camera (spec §5 atmosphere). */
export function createLeaves(scene: THREE.Scene, count = 220, radius = 28) {
  const geo = new THREE.PlaneGeometry(0.16, 0.12)
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.frustumCulled = false
  const colours = [palette.foliageRed, palette.foliageOrange, palette.foliageAmber]
  const c = new THREE.Color()
  const state = Array.from({ length: count }, (_, i) => {
    mesh.setColorAt(i, c.set(colours[i % 3]))
    return {
      p: new THREE.Vector3((Math.random() - 0.5) * radius * 2, Math.random() * 12, (Math.random() - 0.5) * radius * 2),
      phase: Math.random() * 10,
      fall: 0.6 + Math.random() * 0.7,
      spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(3),
    }
  })
  scene.add(mesh)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const one = new THREE.Vector3(1, 1, 1)
  const wrap = (v: number, centre: number) => {
    const d = v - centre
    return d > radius ? v - radius * 2 : d < -radius ? v + radius * 2 : v
  }
  let t = 0
  return {
    mesh,
    update(dt: number, centre: THREE.Vector3, wind: THREE.Vector3) {
      t += dt
      for (let i = 0; i < count; i++) {
        const s = state[i]
        s.p.x += (wind.x + Math.sin(t * 1.3 + s.phase) * 0.6) * dt
        s.p.z += (wind.z + Math.cos(t * 1.1 + s.phase) * 0.6) * dt
        s.p.y -= s.fall * dt
        if (s.p.y < centre.y - 1) s.p.y = centre.y + 10 + Math.random() * 4
        s.p.x = wrap(s.p.x, centre.x)
        s.p.z = wrap(s.p.z, centre.z)
        e.set(s.spin.x * (t + s.phase), s.spin.y * (t + s.phase), s.spin.z * (t + s.phase))
        q.setFromEuler(e)
        m.compose(s.p, q, one)
        mesh.setMatrixAt(i, m)
      }
      mesh.instanceMatrix.needsUpdate = true
    },
  }
}
