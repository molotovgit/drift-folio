import * as THREE from 'three/webgpu'
import type { Vec3 } from '../core/math'
import { palette } from './palette'

/**
 * Dusk lighting rig (spec §5): violet/magenta hemisphere fill, a low warm sun
 * behind the ridge casting shadows near the car, a cool fill, and a rim light
 * kept behind the car relative to the camera so its silhouette pops.
 */
export class SceneLighting {
  private readonly sun = new THREE.DirectionalLight(palette.sunGlow, 2.4)
  private readonly rim = new THREE.DirectionalLight(palette.skyHorizon, 1.3)

  constructor(scene: THREE.Scene, isMobile: boolean) {
    scene.fog = new THREE.Fog(palette.fog, 70, 420)
    scene.add(new THREE.HemisphereLight(palette.skyHorizon, palette.terrainShadow, 2.0))

    // shadows only in a 70 m box that follows the car
    const res = isMobile ? 1024 : 2048
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(res, res)
    Object.assign(this.sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 160 })
    this.sun.shadow.bias = -0.0005
    scene.add(this.sun, this.sun.target)

    const fill = new THREE.DirectionalLight(palette.skyMid, 0.5)
    fill.position.set(30, 20, -40)
    scene.add(fill, this.rim, this.rim.target)
  }

  /** Keep the shadow box on the car and the rim light opposite the camera. */
  update(car: Vec3, camera: THREE.Vector3): void {
    this.sun.position.set(car.x - 45, car.y + 26, car.z + 70)
    this.sun.target.position.set(car.x, car.y, car.z)
    this.rim.target.position.set(car.x, car.y, car.z)
    this.rim.position.set(car.x * 2 - camera.x, car.y + 3, car.z * 2 - camera.z)
  }
}
