import * as THREE from 'three/webgpu'
import { ModelLibrary } from '../render/loadModel'

/** Instances further than this from the camera are never drawn (the fog hides them by ~420 m). */
export const CULL_DISTANCE = 380
/** Everything this close is drawn regardless of direction (shadows, mirrors of view when reversing). */
const ALWAYS_RADIUS = 45
/** Re-cull when the camera moved this far or turned this far (radians) since the last cull. */
const RECULL_MOVE = 6
const RECULL_TURN = 0.12
/** extra angle so a prop's canopy (not just its trunk origin) is kept near the cone edge */
const PROP_MARGIN = 0.2

/**
 * Cosine of the half-angle of the horizontal view cone for culling: the camera's
 * horizontal half-FOV (from vertical FOV and aspect), plus the turn allowed
 * between re-culls, plus a margin for prop size.
 */
export function cullConeCos(camera: THREE.Camera): number {
  const cam = camera as THREE.PerspectiveCamera
  const halfV = cam.isPerspectiveCamera ? THREE.MathUtils.degToRad(cam.fov / 2) : Math.PI / 4
  const halfH = Math.atan(Math.tan(halfV) * (cam.isPerspectiveCamera ? cam.aspect : 1))
  return Math.cos(Math.min(Math.PI, halfH + RECULL_TURN + PROP_MARGIN))
}

/** Options for an instanced prop set. */
export interface InstanceOptions {
  /** cast/receive shadows (default true) */
  shadows?: boolean
  /** receive shadows even when not casting them (default: same as `shadows`) */
  receiveShadow?: boolean
  /** re-cull against the camera every frame (default true) */
  culled?: boolean
  /** never draw instances further than this (default CULL_DISTANCE); small plants use less */
  cullDistance?: number
  /** per-instance tint, parallel to the transforms (multiplies the material and vertex colours) */
  colors?: readonly THREE.Color[]
}

/**
 * Many copies of one glTF model with instancing and CPU culling: one
 * InstancedMesh per sub-mesh of the template (a few draw calls for thousands
 * of trees). Each re-cull packs only the instances near the camera or inside
 * its view cone to the front of the buffer and sets `count`.
 */
export class InstancedProps {
  readonly group = new THREE.Group()
  private readonly meshes: { mesh: THREE.InstancedMesh; local: THREE.Matrix4 }[] = []
  private readonly transforms: readonly THREE.Matrix4[]
  private readonly positions: Float32Array
  private visible = 0
  private readonly lastCamPos = new THREE.Vector3(Infinity, 0, 0)
  private readonly lastCamDir = new THREE.Vector3()
  // scratch
  private readonly combined = new THREE.Matrix4()
  private readonly dir = new THREE.Vector3()

  private readonly culled: boolean
  private readonly cullDistance: number
  private readonly colors: readonly THREE.Color[] | null

  private constructor(template: THREE.Object3D, transforms: readonly THREE.Matrix4[], opts: InstanceOptions) {
    const shadows = opts.shadows ?? true
    const culled = (this.culled = opts.culled ?? true)
    this.cullDistance = opts.cullDistance ?? CULL_DISTANCE
    this.colors = opts.colors && opts.colors.length === transforms.length ? opts.colors : null
    this.transforms = transforms
    this.positions = new Float32Array(transforms.length * 3)
    transforms.forEach((t, i) => this.positions.set([t.elements[12], t.elements[13], t.elements[14]], i * 3))
    template.updateMatrixWorld(true)
    template.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || transforms.length === 0) return
      const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, transforms.length)
      inst.instanceMatrix.setUsage(culled ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage)
      inst.castShadow = shadows
      inst.receiveShadow = opts.receiveShadow ?? shadows
      // culling happens on the CPU per instance; the whole mesh must never be frustum-culled
      inst.frustumCulled = false
      if (this.colors) {
        inst.setColorAt(0, this.colors[0]) // allocates instanceColor
        inst.instanceColor!.setUsage(culled ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage)
      }
      // nothing is drawn until the first cull (unset instance matrices sit at the origin)
      if (culled) inst.count = 0
      this.meshes.push({ mesh: inst, local: mesh.matrixWorld.clone() })
      this.group.add(inst)
    })
    if (!culled) this.writeAll()
  }

  /** Load the named model and instance it at every transform. */
  static async create(model: string, transforms: readonly THREE.Matrix4[], opts: InstanceOptions = {}): Promise<InstancedProps> {
    return new InstancedProps(await ModelLibrary.load(model), transforms, opts)
  }

  /** Instance an already-built template (e.g. procedural vegetation) at every transform. */
  static fromTemplate(template: THREE.Object3D, transforms: readonly THREE.Matrix4[], opts: InstanceOptions = {}): InstancedProps {
    return new InstancedProps(template, transforms, opts)
  }

  get drawCount(): number {
    return this.culled ? this.visible : this.transforms.length
  }

  /** Re-pack visible instances when the camera has moved or turned enough. */
  update(camera: THREE.Camera): void {
    if (!this.culled) return
    camera.getWorldDirection(this.dir)
    if (this.lastCamPos.distanceToSquared(camera.position) < RECULL_MOVE ** 2 && this.lastCamDir.dot(this.dir) > Math.cos(RECULL_TURN)) return
    this.lastCamPos.copy(camera.position)
    this.lastCamDir.copy(this.dir)

    const cx = camera.position.x
    const cz = camera.position.z
    // horizontal view direction
    const hl = Math.hypot(this.dir.x, this.dir.z) || 1
    const fx = this.dir.x / hl
    const fz = this.dir.z / hl
    const coneCos = cullConeCos(camera)
    let n = 0
    for (let i = 0; i < this.transforms.length; i++) {
      const dx = this.positions[i * 3] - cx
      const dz = this.positions[i * 3 + 2] - cz
      const d = Math.hypot(dx, dz)
      if (d > this.cullDistance) continue
      if (d > ALWAYS_RADIUS && (dx * fx + dz * fz) / d < coneCos) continue
      for (const { mesh, local } of this.meshes) {
        mesh.setMatrixAt(n, this.combined.multiplyMatrices(this.transforms[i], local))
        if (this.colors) mesh.setColorAt(n, this.colors[i])
      }
      n++
    }
    this.visible = n
    for (const { mesh } of this.meshes) {
      mesh.count = n
      mesh.instanceMatrix.clearUpdateRanges()
      mesh.instanceMatrix.addUpdateRange(0, n * 16)
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) {
        mesh.instanceColor.clearUpdateRanges()
        mesh.instanceColor.addUpdateRange(0, n * 3)
        mesh.instanceColor.needsUpdate = true
      }
    }
  }

  private writeAll(): void {
    this.transforms.forEach((t, i) => {
      for (const { mesh, local } of this.meshes) {
        mesh.setMatrixAt(i, this.combined.multiplyMatrices(t, local))
        if (this.colors) mesh.setColorAt(i, this.colors[i])
      }
    })
    for (const { mesh } of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }
}

/** Build a transform from position, yaw and uniform scale. */
export function placeMatrix(x: number, y: number, z: number, yaw = 0, scale = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(scale, scale, scale),
  )
}
