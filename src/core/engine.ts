import * as THREE from 'three/webgpu'

export type GpuTier = 'webgpu' | 'webgl2' | 'none'

interface GpuNavigator {
  gpu?: { requestAdapter: () => Promise<unknown | null> }
}

/** Decide which rendering backend the device can run. */
export async function detectGpu(nav: GpuNavigator, canvas: HTMLCanvasElement): Promise<GpuTier> {
  try {
    if (nav.gpu) {
      const adapter = await nav.gpu.requestAdapter()
      if (adapter) return 'webgpu'
    }
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

export interface Engine {
  renderer: THREE.WebGPURenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  tier: GpuTier
  isMobile: boolean
  onFrame(cb: (dt: number, time: number) => void): void
  onContextLost(cb: () => void): void
  setPixelRatioCap(cap: number): void
  dispose(): void
}

export function isMobileDevice(): boolean {
  return matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent)
}

export async function createEngine(canvas: HTMLCanvasElement, tier: Exclude<GpuTier, 'none'>): Promise<Engine> {
  const isMobile = isMobileDevice()
  let dprCap = isMobile ? 1.5 : 2
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: !isMobile, forceWebGL: tier === 'webgl2' })
  await renderer.init()
  renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2500)

  const resize = () => {
    const w = canvas.clientWidth || innerWidth
    const h = canvas.clientHeight || innerHeight
    renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap))
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)

  const frameCbs: Array<(dt: number, time: number) => void> = []
  const lostCbs: Array<() => void> = []
  let last = performance.now()
  renderer.setAnimationLoop((now: number) => {
    const dt = Math.max(0, (now - last) / 1000)
    last = now
    for (const cb of frameCbs) cb(dt, now / 1000)
  })
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    lostCbs.forEach((cb) => cb())
  })
  const backend = (renderer as unknown as { backend?: { device?: { lost?: Promise<unknown> } } }).backend
  backend?.device?.lost?.then(() => lostCbs.forEach((cb) => cb()))

  return {
    renderer, scene, camera, tier, isMobile,
    onFrame: (cb) => void frameCbs.push(cb),
    onContextLost: (cb) => void lostCbs.push(cb),
    setPixelRatioCap: (cap) => { dprCap = cap; resize() },
    dispose: () => { ro.disconnect(); renderer.setAnimationLoop(null); renderer.dispose() },
  }
}
