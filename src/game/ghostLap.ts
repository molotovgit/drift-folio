import * as THREE from 'three/webgpu'
import { assetUrl, ModelLibrary } from '../render/loadModel'
import type { SafeStorage } from '../util/storage'
import { carConfig } from '../vehicle/carConfig'
import { decodeGhost, GhostPlayer } from './ghost'

const GHOST_OPACITY = 0.35

/**
 * The Systems Drop ghost (spec §8): a translucent FD replaying the recorded
 * run whenever the player starts a Systems Drop run. Finishing faster than the
 * ghost beats it, which is remembered and unlocks the hidden peak (S6).
 */
export class GhostLap {
  private player: GhostPlayer | null = null
  private mesh: THREE.Object3D | null = null
  private runTime: number | null = null
  private beatenValue: boolean

  constructor(
    private readonly scene: THREE.Scene,
    private readonly storage: SafeStorage,
  ) {
    this.beatenValue = storage.get<boolean>('ghost-beaten', false)
  }

  get beaten(): boolean {
    return this.beatenValue
  }

  /** Ghost run time in seconds (null when not loaded). */
  get duration(): number | null {
    return this.player?.duration ?? null
  }

  /** Fetch the recording and build the translucent car. Failure leaves the ghost disabled. */
  async load(): Promise<void> {
    try {
      const res = await fetch(assetUrl('ghost/systems.json'))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      this.player = new GhostPlayer(decodeGhost(await res.text()))
      this.mesh = GhostLap.translucent((await ModelLibrary.load('fd')).clone(true))
      this.mesh.visible = false
      this.scene.add(this.mesh)
    } catch (err) {
      console.warn('ghost lap unavailable', err)
    }
  }

  /** A Systems Drop run started: the ghost starts with you. */
  start(): void {
    if (this.player) this.runTime = 0
  }

  /** Advance with the fixed physics step so the ghost stays in sync with the run clock. */
  tick(h: number): void {
    if (this.runTime === null || !this.player || !this.mesh) return
    this.runTime += h
    const p = this.player.poseAt(this.runTime)
    if (!p) {
      this.mesh.visible = false
      this.runTime = null
      return
    }
    this.mesh.visible = true
    // ghost poses are body (CoM) positions; the model's origin is on the ground
    this.mesh.position.set(p.pos.x, p.pos.y - carConfig.comHeight, p.pos.z)
    this.mesh.rotation.set(0, p.yaw, 0)
  }

  /** The run finished in `time` seconds; returns true if this beat the ghost for the first time. */
  finish(time: number): boolean {
    this.runTime = null
    if (this.mesh) this.mesh.visible = false
    if (!this.player || time >= this.player.duration || this.beatenValue) return false
    this.beatenValue = true
    this.storage.set('ghost-beaten', true)
    return true
  }

  /** Abandoned run (went back up, reset elsewhere). */
  cancel(): void {
    this.runTime = null
    if (this.mesh) this.mesh.visible = false
  }

  private static translucent(model: THREE.Object3D): THREE.Object3D {
    const ghostMat = new THREE.MeshBasicNodeMaterial({ color: '#bfefff', transparent: true, opacity: GHOST_OPACITY, depthWrite: false })
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = ghostMat
      mesh.castShadow = false
      mesh.receiveShadow = false
    })
    return model
  }
}
