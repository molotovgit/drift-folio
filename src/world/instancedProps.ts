import * as THREE from 'three/webgpu'
import { ModelLibrary } from '../render/loadModel'

/** Instances further than this from the camera are never drawn (the fog hides them by ~420 m). */
export const CULL_DISTANCE = 380
/** Everything this close is drawn regardless of direction (shadows, mirrors of view when reversing). */
export const ALWAYS_RADIUS = 45
/** Re-cull when the camera moved this far or turned this far (radians) since the last cull. */
const RECULL_MOVE = 6
const RECULL_TURN = 0.12
/** extra angle so a prop's canopy (not just its trunk origin) is kept near the cone edge */
const PROP_MARGIN = 0.2
/** Cell size of each set's spatial grid, metres: a re-cull only scans cells within its cull distance. */
const GRID_CELL = 48
/** At most this many sets re-cull per frame (the rest keep last frame's packing)… */
const RECULLS_PER_FRAME = 4
/** …but no set waits longer than this many frames for its turn. */
const MAX_DEFER_FRAMES = 6

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
  /** per-instance thinning roll in [0, 1), parallel to the transforms; see `setThinning` */
  keep?: Float32Array
}

/**
 * Spreads re-culls of many prop sets over several frames: each frame at most
 * RECULLS_PER_FRAME sets that need one get it, starting after the last set
 * served (round-robin), and a set that has waited MAX_DEFER_FRAMES is served
 * regardless. Sets that have never been culled are always served at once.
 */
export class CullScheduler {
  private frameNo = 0
  private budget = 0
  private next = 0

  constructor(
    private readonly perFrame = RECULLS_PER_FRAME,
    private readonly maxDefer = MAX_DEFER_FRAMES,
  ) {}

  get frame(): number {
    return this.frameNo
  }

  /** Per-frame: offer every set a re-cull, round-robin from where the last frame stopped. */
  update(sets: readonly InstancedProps[], camera: THREE.Camera): void {
    this.frameNo++
    this.budget = this.perFrame
    const n = sets.length
    let last = -1
    for (let k = 0; k < n; k++) {
      const i = (this.next + k) % n
      if (sets[i].update(camera, this)) last = i
    }
    if (last >= 0) this.next = (last + 1) % n
  }

  /** May a set that has wanted a re-cull since frame `since` run it now? */
  grant(since: number): boolean {
    if (this.budget > 0) {
      this.budget--
      return true
    }
    return this.frameNo - since >= this.maxDefer
  }
}

/**
 * Many copies of one glTF model with instancing and CPU culling: one
 * InstancedMesh per sub-mesh of the template (a few draw calls for thousands
 * of trees). Each re-cull packs only the kept instances near the camera or
 * inside its view cone to the front of the buffer and sets `count`; it scans
 * only the grid cells within the cull distance.
 */
export class InstancedProps {
  readonly group = new THREE.Group()
  private readonly meshes: { mesh: THREE.InstancedMesh; local: THREE.Matrix4; identity: boolean }[] = []
  private readonly transforms: readonly THREE.Matrix4[]
  private readonly positions: Float32Array
  private visible = 0
  private readonly lastCamPos = new THREE.Vector3(Infinity, 0, 0)
  private readonly lastCamDir = new THREE.Vector3()
  /** scheduler frame since which this set has wanted a re-cull (-1: not waiting) */
  private waitingSince = -1
  // scratch
  private readonly combined = new THREE.Matrix4()
  private readonly dir = new THREE.Vector3()

  private readonly culled: boolean
  private readonly cullDistance: number
  private readonly colors: readonly THREE.Color[] | null
  /** thinning: instance i is drawn only while keep[i] < keepBelow */
  private readonly keep: Float32Array | null
  private keepBelow = 1

  // uniform grid over the instances (CSR layout: cell c holds cellItems[cellStart[c] .. cellStart[c + 1]))
  private gridMinX = 0
  private gridMinZ = 0
  private gridCols = 0
  private gridRows = 0
  private cellStart = new Int32Array(1)
  private cellItems = new Int32Array(0)

  private constructor(template: THREE.Object3D, transforms: readonly THREE.Matrix4[], opts: InstanceOptions) {
    const shadows = opts.shadows ?? true
    const culled = (this.culled = opts.culled ?? true)
    this.cullDistance = opts.cullDistance ?? CULL_DISTANCE
    this.colors = InstancedProps.parallel('colors', opts.colors, transforms.length)
    this.keep = InstancedProps.parallel('keep', opts.keep, transforms.length)
    this.transforms = transforms
    this.positions = new Float32Array(transforms.length * 3)
    transforms.forEach((t, i) => {
      this.positions[i * 3] = t.elements[12]
      this.positions[i * 3 + 1] = t.elements[13]
      this.positions[i * 3 + 2] = t.elements[14]
    })
    if (culled) this.buildGrid()
    template.updateMatrixWorld(true)
    const identity = new THREE.Matrix4()
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
      const local = mesh.matrixWorld.clone()
      this.meshes.push({ mesh: inst, local, identity: local.equals(identity) })
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
    return this.visible
  }

  /**
   * Draw only instances whose keep roll is below `frac` (1 = all). Rolls are
   * fixed per instance, so a lower fraction always draws a subset of a higher
   * one. Takes effect on the next update (forces a re-cull).
   */
  setThinning(frac: number): void {
    if (frac === this.keepBelow) return
    this.keepBelow = frac
    if (this.culled) this.lastCamPos.set(Infinity, 0, 0)
    else this.writeAll()
  }

  /**
   * Re-pack visible instances when the camera has moved or turned enough. With
   * a scheduler the re-cull may be deferred to a later frame. Returns true if
   * it re-culled.
   */
  update(camera: THREE.Camera, scheduler?: CullScheduler): boolean {
    if (!this.culled) return false
    camera.getWorldDirection(this.dir)
    const fresh = this.lastCamPos.x === Infinity
    if (!fresh && this.lastCamPos.distanceToSquared(camera.position) < RECULL_MOVE ** 2 && this.lastCamDir.dot(this.dir) > Math.cos(RECULL_TURN)) {
      this.waitingSince = -1
      return false
    }
    if (scheduler && !fresh) {
      if (this.waitingSince < 0) this.waitingSince = scheduler.frame
      if (!scheduler.grant(this.waitingSince)) return false
    }
    this.waitingSince = -1
    this.lastCamPos.copy(camera.position)
    this.lastCamDir.copy(this.dir)
    this.recull(camera)
    return true
  }

  private recull(camera: THREE.Camera): void {
    const cx = camera.position.x
    const cz = camera.position.z
    // horizontal view direction
    const hl = Math.hypot(this.dir.x, this.dir.z) || 1
    const fx = this.dir.x / hl
    const fz = this.dir.z / hl
    const coneCos = cullConeCos(camera)
    const maxD2 = this.cullDistance * this.cullDistance
    const always2 = ALWAYS_RADIUS * ALWAYS_RADIUS
    const keep = this.keep
    // the block of cells overlapping the cull circle's bounding square
    const c0 = Math.max(0, Math.floor((cx - this.cullDistance - this.gridMinX) / GRID_CELL))
    const c1 = Math.min(this.gridCols - 1, Math.floor((cx + this.cullDistance - this.gridMinX) / GRID_CELL))
    const r0 = Math.max(0, Math.floor((cz - this.cullDistance - this.gridMinZ) / GRID_CELL))
    const r1 = Math.min(this.gridRows - 1, Math.floor((cz + this.cullDistance - this.gridMinZ) / GRID_CELL))
    let n = 0
    for (let r = r0; r <= r1; r++) {
      const z0 = this.gridMinZ + r * GRID_CELL
      const ez = cz < z0 ? z0 - cz : cz > z0 + GRID_CELL ? cz - z0 - GRID_CELL : 0
      for (let c = c0; c <= c1; c++) {
        // skip corner cells wholly outside the cull circle
        const x0 = this.gridMinX + c * GRID_CELL
        const ex = cx < x0 ? x0 - cx : cx > x0 + GRID_CELL ? cx - x0 - GRID_CELL : 0
        if (ex * ex + ez * ez > maxD2) continue
        const cell = r * this.gridCols + c
        for (let j = this.cellStart[cell]; j < this.cellStart[cell + 1]; j++) {
          const i = this.cellItems[j]
          if (keep && keep[i] >= this.keepBelow) continue
          const dx = this.positions[i * 3] - cx
          const dz = this.positions[i * 3 + 2] - cz
          const d2 = dx * dx + dz * dz
          if (d2 > maxD2) continue
          if (d2 > always2 && dx * fx + dz * fz < coneCos * Math.sqrt(d2)) continue
          this.pack(n++, i)
        }
      }
    }
    this.commit(n)
  }

  /** Write instance `i` (matrix and tint) into buffer slot `slot`. */
  private pack(slot: number, i: number): void {
    // indexed loop: this runs per visible instance, keep it free of iterator garbage
    for (let m = 0; m < this.meshes.length; m++) {
      const { mesh, local, identity } = this.meshes[m]
      mesh.setMatrixAt(slot, identity ? this.transforms[i] : this.combined.multiplyMatrices(this.transforms[i], local))
      if (this.colors) mesh.setColorAt(slot, this.colors[i])
    }
  }

  /** Draw the first `n` packed slots and upload just that range. */
  private commit(n: number): void {
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

  /** Unculled sets: pack every kept instance once. */
  private writeAll(): void {
    let n = 0
    for (let i = 0; i < this.transforms.length; i++) if (!this.keep || this.keep[i] < this.keepBelow) this.pack(n++, i)
    this.commit(n)
  }

  /** Bucket the instances into GRID_CELL squares (counting sort into CSR arrays). */
  private buildGrid(): void {
    const count = this.transforms.length
    if (count === 0) return
    let minX = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxZ = -Infinity
    for (let i = 0; i < count; i++) {
      const x = this.positions[i * 3]
      const z = this.positions[i * 3 + 2]
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
    this.gridMinX = minX
    this.gridMinZ = minZ
    this.gridCols = Math.floor((maxX - minX) / GRID_CELL) + 1
    this.gridRows = Math.floor((maxZ - minZ) / GRID_CELL) + 1
    const cellOf = new Int32Array(count)
    this.cellStart = new Int32Array(this.gridCols * this.gridRows + 1)
    for (let i = 0; i < count; i++) {
      const c = Math.floor((this.positions[i * 3] - minX) / GRID_CELL)
      const r = Math.floor((this.positions[i * 3 + 2] - minZ) / GRID_CELL)
      cellOf[i] = r * this.gridCols + c
      this.cellStart[cellOf[i] + 1]++
    }
    for (let c = 0; c < this.gridCols * this.gridRows; c++) this.cellStart[c + 1] += this.cellStart[c]
    const fill = this.cellStart.slice(0, -1)
    this.cellItems = new Int32Array(count)
    for (let i = 0; i < count; i++) this.cellItems[fill[cellOf[i]]++] = i
  }

  /** A per-instance option array, or null (with a warning) when its length does not match the transforms. */
  private static parallel<T extends ArrayLike<unknown>>(name: string, values: T | undefined, count: number): T | null {
    if (!values) return null
    if (values.length === count) return values
    console.warn(`InstancedProps: ${name} has ${values.length} entries for ${count} instances; ignored`)
    return null
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
