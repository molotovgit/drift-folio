import * as THREE from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { dot, float, max, mix, normalize, positionLocal, pow, smoothstep, uniform, vec3 } from 'three/tsl'
import { palette } from './palette'

/** Palette hex → linear vec3 node (THREE.Color converts sRGB to the linear working space). */
const c3 = (hex: string) => {
  const c = new THREE.Color(hex)
  return vec3(c.r, c.g, c.b)
}

/**
 * Dusk sky dome (spec §5): magenta horizon → violet → deep purple, with a warm
 * glow where the sun has just set behind the ridge. Re-centred on the camera
 * every frame so it never clips.
 */
export class SkyDome {
  readonly mesh: THREE.Mesh
  /** direction to the (set) sun; also drives the warm glow */
  readonly sunDir = uniform(new THREE.Vector3(-0.55, 0.06, 0.83).normalize())

  constructor(radius = 1800) {
    const dir = normalize(positionLocal)
    const h = dir.y
    const low = mix(c3(palette.skyHorizon), c3(palette.skyMid), smoothstep(float(0.0), float(0.28), h))
    let sky: Node<'vec3'> = mix(low, c3(palette.skyTop), smoothstep(float(0.25), float(0.85), h))
    // below the horizon: fade into the fog colour so distant terrain blends in
    sky = mix(sky, c3(palette.fog), smoothstep(float(0.0), float(-0.15), h))
    const sunAmount = pow(max(dot(dir, this.sunDir), float(0)), float(10))
    sky = sky.add(c3(palette.sunGlow).mul(sunAmount.mul(0.55)))

    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false })
    mat.colorNode = sky
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1
  }

  follow(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position)
  }
}
