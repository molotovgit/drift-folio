import * as THREE from 'three/webgpu'
import { palette } from './palette'

/** reused by nearestAnchors so the per-frame call does not allocate */
const scratchDists: number[] = []

/**
 * Indices of the n anchors closest to (x, z), nearest first. `anchors` is a flat
 * [x0, z0, x1, z1, …] array. Writes into `out` (reused) to avoid per-frame allocation.
 */

export function nearestAnchors(anchors: ArrayLike<number>, x: number, z: number, n: number, out: number[] = []): number[] {
  out.length = 0
  const dists = scratchDists
  dists.length = 0
  const count = anchors.length / 2
  for (let i = 0; i < count; i++) {
    const dx = anchors[i * 2] - x
    const dz = anchors[i * 2 + 1] - z
    const d = dx * dx + dz * dz
    if (out.length === n && d >= dists[n - 1]) continue
    // insertion into a tiny sorted list (n is 2–4)
    let k = out.length < n ? out.length : n - 1
    while (k > 0 && dists[k - 1] > d) {
      out[k] = out[k - 1]
      dists[k] = dists[k - 1]
      k--
    }
    out[k] = i
    dists[k] = d
  }
  return out
}

const LAMP_INTENSITY = 40
const LAMP_RANGE = 24

/**
 * A fixed pool of warm point lights, created once at boot (so no shader
 * recompiles later) and moved each frame to the lamp anchors nearest the camera.
 */
export class LightPool {
  readonly lights: THREE.PointLight[]
  /** positions of the lights currently switched on (reused array) */
  readonly active: THREE.Vector3[] = []
  private anchors: THREE.Vector3[] = []
  private flat = new Float32Array(0)
  private readonly picked: number[] = []

  constructor(scene: THREE.Scene, size = 4) {
    this.lights = Array.from({ length: size }, () => {
      const l = new THREE.PointLight(palette.lampGlow, 0, LAMP_RANGE, 1.6)
      l.castShadow = false
      scene.add(l)
      return l
    })
  }

  setAnchors(points: THREE.Vector3[]): void {
    this.anchors = points
    this.flat = new Float32Array(points.length * 2)
    points.forEach((p, i) => {
      this.flat[i * 2] = p.x
      this.flat[i * 2 + 1] = p.z
    })
  }

  update(focus: THREE.Vector3): void {
    nearestAnchors(this.flat, focus.x, focus.z, this.lights.length, this.picked)
    this.active.length = 0
    this.lights.forEach((light, k) => {
      const idx = this.picked[k]
      if (idx === undefined) {
        light.intensity = 0
        return
      }
      light.position.copy(this.anchors[idx])
      light.intensity = LAMP_INTENSITY
      this.active.push(light.position)
    })
  }
}
