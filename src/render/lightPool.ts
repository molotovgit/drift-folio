import * as THREE from 'three/webgpu'
import { palette } from './palette'

/** Indices of the n anchors closest to (x, z), nearest first. Pure; allocation-light. */
export function nearestAnchors(anchors: ArrayLike<number>, x: number, z: number, n: number): number[] {
  const count = anchors.length / 2
  const best: { i: number; d: number }[] = []
  for (let i = 0; i < count; i++) {
    const dx = anchors[i * 2] - x
    const dz = anchors[i * 2 + 1] - z
    const d = dx * dx + dz * dz
    if (best.length < n || d < best[best.length - 1].d) {
      best.push({ i, d })
      best.sort((a, b) => a.d - b.d)
      if (best.length > n) best.pop()
    }
  }
  return best.map((b) => b.i)
}

/**
 * A fixed pool of warm point lights, created once at boot (no shader recompiles
 * later), moved each frame to the lamp anchors nearest the car.
 */
export function createLightPool(scene: THREE.Scene, size = 4) {
  const lights = Array.from({ length: size }, () => {
    const l = new THREE.PointLight(palette.lampGlow, 0, 24, 1.6)
    l.castShadow = false
    scene.add(l)
    return l
  })
  let anchors: THREE.Vector3[] = []
  let flat = new Float32Array(0)
  return {
    lights,
    setAnchors(points: THREE.Vector3[]) {
      anchors = points
      flat = new Float32Array(points.length * 2)
      points.forEach((p, i) => {
        flat[i * 2] = p.x
        flat[i * 2 + 1] = p.z
      })
    },
    update(focus: THREE.Vector3) {
      const pick = nearestAnchors(flat, focus.x, focus.z, size)
      lights.forEach((l, k) => {
        const idx = pick[k]
        if (idx === undefined) {
          l.intensity = 0
          return
        }
        l.position.copy(anchors[idx])
        l.intensity = 40
      })
    },
  }
}
