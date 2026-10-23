import * as THREE from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { float, mix, normalize, positionLocal, pow, smoothstep, uniform, vec3, max, dot } from 'three/tsl'
import { palette } from './palette'

/**
 * Dusk sky dome (spec §5): magenta horizon → violet → deep purple, with a warm
 * glow where the sun has just set behind the ridge. Follows the camera.
 */
/** Palette hex → linear vec3 node (THREE.Color converts sRGB to the linear working space). */
const c3 = (hex: string) => {
  const c = new THREE.Color(hex)
  return vec3(c.r, c.g, c.b)
}

export function createSky(radius = 1800) {
  const sunDir = uniform(new THREE.Vector3(-0.55, 0.06, 0.83).normalize())
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false })
  const dir = normalize(positionLocal)
  const h = dir.y
  const horizon = c3(palette.skyHorizon)
  const mid = c3(palette.skyMid)
  const top = c3(palette.skyTop)
  const low = mix(horizon, mid, smoothstep(float(0.0), float(0.28), h))
  let sky: Node<'vec3'> = mix(low, top, smoothstep(float(0.25), float(0.85), h))
  // below the horizon: fade into the fog colour so distant terrain blends
  sky = mix(sky, c3(palette.fog), smoothstep(float(0.0), float(-0.15), h))
  const sunAmount = pow(max(dot(dir, sunDir), float(0)), float(10))
  sky = sky.add(c3(palette.sunGlow).mul(sunAmount.mul(0.55)))
  mat.colorNode = sky
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat)
  mesh.frustumCulled = false
  mesh.renderOrder = -1
  return {
    mesh,
    sunDir,
    follow(camera: THREE.Camera) {
      mesh.position.copy(camera.position)
    },
  }
}
