import * as THREE from 'three/webgpu'
import { ContextGuard } from './contextGuard'

export type GpuTier = 'webgpu' | 'webgl2' | 'none'

export interface GpuNavigator {
  gpu?: { requestAdapter: () => Promise<unknown | null> }
}

/** Decide which rendering backend the device can run: WebGPU, then WebGL2, else none. */
export async function detectGpu(nav: GpuNavigator, canvas: HTMLCanvasElement): Promise<GpuTier> {
  try {
    if (nav.gpu && (await nav.gpu.requestAdapter())) return 'webgpu'
  } catch {
    /* fall through to WebGL2 */
  }
  try {
    if (canvas.getContext('webgl2')) return 'webgl2'
  } catch {
    /* none */
  }
  return 'none'
}

export function isMobileDevice(): boolean {
  return matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent)
}

type FrameCallback = (dt: number, time: number) => void

/**
 * Owns the renderer, scene and camera: sizing, pixel-ratio cap, the animation
 * loop and GPU context-loss handling.
 */
export class Engine {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2500)
  readonly isMobile = isMobileDevice()

  private dprCap: number
  private readonly frameCallbacks: FrameCallback[] = []
  private readonly lostCallbacks: Array<() => void> = []
  private readonly resizeObserver: ResizeObserver
  private readonly guard: ContextGuard
  private lastTime = performance.now()

  private constructor(
    readonly renderer: THREE.WebGPURenderer,
    readonly canvas: HTMLCanvasElement,
    readonly tier: Exclude<GpuTier, 'none'>,
  ) {
    this.dprCap = this.isMobile ? 1.5 : 2
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()

    // three calls onDeviceLost for WebGPU device loss (not intentional destroy) and
    // WebGL context loss. three never rebuilds GPU resources after a WebGL restore,
    // so a restored context is handled by reloading the page (scores live in storage).
    this.guard = new ContextGuard(() => this.lostCallbacks.forEach((cb) => cb()))
    const threeOnLost = renderer.onDeviceLost.bind(renderer) // marks the renderer as lost
    renderer.onDeviceLost = (info) => {
      threeOnLost(info)
      this.guard.lost()
    }
    canvas.addEventListener('webglcontextrestored', this.onRestored)

    renderer.setAnimationLoop((now: number) => {
      const dt = Math.max(0, (now - this.lastTime) / 1000)
      this.lastTime = now
      for (const cb of this.frameCallbacks) cb(dt, now / 1000)
    })
  }

  /** Create and initialise the renderer for the detected tier. */
  static async create(canvas: HTMLCanvasElement, tier: Exclude<GpuTier, 'none'>): Promise<Engine> {
    // MSAA is skipped on phones (fill-rate); the outline pass keeps edges crisp
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: !isMobileDevice(), alpha: true, forceWebGL: tier === 'webgl2' })
    await renderer.init()
    return new Engine(renderer, canvas, tier)
  }

  onFrame(cb: FrameCallback): void {
    this.frameCallbacks.push(cb)
  }

  /** Fires once when the GPU context is lost and has not come back within 3 s. */
  onContextLost(cb: () => void): void {
    this.lostCallbacks.push(cb)
  }

  setPixelRatioCap(cap: number): void {
    this.dprCap = cap
    this.resize()
  }

  dispose(): void {
    this.resizeObserver.disconnect()
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored)
    this.renderer.onDeviceLost = () => {}
    this.renderer.setAnimationLoop(null)
    this.renderer.dispose()
  }

  private readonly onRestored = () => {
    this.guard.restored()
    location.reload()
  }

  private resize(): void {
    const w = this.canvas.clientWidth || innerWidth
    const h = this.canvas.clientHeight || innerHeight
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.dprCap))
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }
}
