import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { ChaseCamera } from '../camera/chaseCamera'
import { Engine, type GpuTier } from '../core/engine'
import { idleControls, InputController, type ControlState } from '../core/input'
import { FixedStepLoop, MAX_FRAME, PHYSICS_STEP } from '../core/loop'
import { EmberSystem } from '../fx/embers'
import { LeafSystem } from '../fx/leaves'
import { SkidMarks } from '../fx/skids'
import { smokeGate, SmokeSystem } from '../fx/smoke'
import { SceneLighting } from '../render/lighting'
import { LightPool } from '../render/lightPool'
import { PostPipeline, type QualityTier } from '../render/post'
import { SkyDome } from '../render/sky'
import { skipOverlay } from '../ui/skip'
import { BoxCarVisual, FdCarVisual, type CarVisual } from '../vehicle/carVisual'
import { DriftCar, type Telemetry } from '../vehicle/driftCar'
import { greyboxDressing, PropPlacer } from '../world/dressing'
import { Greybox } from '../world/greybox'
import { groundHeight } from '../world/ground'
import type { GameOptions } from './options'

const REAR_WHEELS = [2, 3] as const
const WIND = new THREE.Vector3(0.9, 0, 0.4)

/**
 * The whole running game: owns the engine, physics world, car, effects,
 * camera and post pipeline, and drives them from one frame callback.
 * Physics ticks at a fixed 60 Hz; rendering interpolates between ticks.
 */
export class Game {
  private readonly world: RAPIER.World
  private readonly car: DriftCar
  private readonly input = new InputController(window)
  private readonly camera: ChaseCamera
  private readonly loop: FixedStepLoop
  private readonly sky = new SkyDome()
  private readonly lighting: SceneLighting
  private readonly lamps: LightPool
  private readonly post: PostPipeline
  private readonly smoke: SmokeSystem
  private readonly skids: SkidMarks
  private readonly leaves: LeafSystem | null
  private readonly embers: EmberSystem | null
  private readonly greybox: Greybox
  private controls: ControlState = idleControls()

  private constructor(
    private readonly engine: Engine,
    private readonly visual: CarVisual,
    readonly quality: QualityTier,
    options: GameOptions,
  ) {
    const { scene } = engine
    scene.add(this.sky.mesh)
    this.lighting = new SceneLighting(scene, engine.isMobile)
    this.lamps = new LightPool(scene, engine.isMobile ? 2 : 4)
    this.post = new PostPipeline(engine.renderer, scene, engine.camera, quality)
    if (quality === 'low') engine.setPixelRatioCap(1)
    this.watchReducedMotion()

    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.world.timestep = PHYSICS_STEP
    this.greybox = new Greybox(scene, this.world)
    this.car = new DriftCar(this.world, { x: 0, y: 0, z: 0 }, 0)
    visual.setHeadlights(quality !== 'low')
    scene.add(visual.root)

    this.smoke = new SmokeSystem(scene)
    this.skids = new SkidMarks(scene)
    this.leaves = quality === 'low' ? null : new LeafSystem(scene)
    this.embers = quality === 'high' ? new EmberSystem(scene) : null
    this.camera = new ChaseCamera(engine.camera)
    this.loop = new FixedStepLoop(PHYSICS_STEP, options.maxFrame, (h) => this.physicsTick(h))
    engine.onFrame((dt) => this.frame(dt))
  }

  /** Initialise everything (renderer, physics wasm, car model, props) and start the loop. */
  static async start(canvas: HTMLCanvasElement, tier: Exclude<GpuTier, 'none'>, options: GameOptions): Promise<Game> {
    const [engine] = await Promise.all([Engine.create(canvas, tier), RAPIER.init()])
    engine.onContextLost(() => skipOverlay.open('context-lost'))
    const visual = await FdCarVisual.load().catch((err) => {
      console.warn('FD model failed to load, using the grey-box car', err)
      return new BoxCarVisual()
    })
    const game = new Game(engine, visual, options.qualityFor(engine.isMobile), options)
    await game.dress()
    if (options.debug) game.exposeDebugApi()
    return game
  }

  /** Place the props and hand the lamp bulbs to the light pool. */
  private async dress(): Promise<void> {
    const props = await PropPlacer.place(this.engine.scene, greyboxDressing())
    this.lamps.setAnchors(PropPlacer.anchors(props, 'light_anchor'))
  }

  /** One fixed physics tick. */
  private physicsTick(h: number): void {
    this.car.update(this.controls, h)
    this.world.step()
    this.car.wheels().forEach((w, i) => this.skids.step(i, w.contact ? w.contactPoint : null, w.slide))
  }

  /** One rendered frame. */
  private frame(rawDt: number): void {
    const dt = Math.min(rawDt, MAX_FRAME)
    const paused = skipOverlay.isOpen
    const fxDt = paused ? 0 : dt
    this.readControls(dt, paused)

    const alpha = paused ? 1 : this.loop.advance(rawDt)
    this.greybox.update()
    const pose = this.car.pose(alpha)
    this.visual.sync(this.car, pose)
    const t: Telemetry = { ...this.car.telemetry(), pos: pose.pos }

    this.updateEffects(t, fxDt)
    this.camera.update(t, dt)
    const camPos = this.engine.camera.position
    this.sky.follow(this.engine.camera)
    this.lighting.update(t.pos, camPos)
    this.lamps.update(camPos)
    this.post.render(t.speed)
  }

  private readControls(dt: number, paused: boolean): void {
    const c = this.input.read(dt)
    // driving inputs are ignored while the overlay is open
    this.controls = paused ? { ...c, throttle: 0, brake: 0, steer: 0, handbrake: false } : c
    if (c.camera) this.camera.toggleMode()
    if (c.reset) this.resetCar()
  }

  /** R: put the car back on the ground where it is, upright, facing the same way. */
  private resetCar(): void {
    const t = this.car.telemetry()
    this.car.resetTo({ x: t.pos.x, y: groundHeight(this.world, t.pos.x, t.pos.z, this.car.body), z: t.pos.z }, t.yaw)
    this.camera.snap()
  }

  private updateEffects(t: Telemetry, dt: number): void {
    const wheels = this.car.wheels()
    for (const i of REAR_WHEELS) {
      const w = wheels[i]
      if (w.contact) this.smoke.emit(w.contactPoint, smokeGate(t.drifting, w.slide), t.vel, dt)
    }
    const cam = this.engine.camera
    this.smoke.update(dt, cam)
    this.skids.flush()
    this.leaves?.update(dt, cam.position, WIND)
    if (this.embers) {
      this.embers.setSources(this.lamps.active)
      this.embers.update(dt, cam)
    }
  }

  private watchReducedMotion(): void {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    this.post.setReducedMotion(mq.matches)
    mq.addEventListener('change', (e) => this.post.setReducedMotion(e.matches))
  }

  /** `window.__drift` for Playwright tests (only with ?debug). */
  private exposeDebugApi(): void {
    const { camera, renderer } = this.engine
    ;(window as unknown as { __drift: unknown }).__drift = {
      telemetry: () => this.car.telemetry(),
      wheels: () => this.car.wheels(),
      cameraY: () => camera.position.y - this.car.telemetry().pos.y,
      skidCount: () => this.skids.buffer.count,
      smokeLive: () => this.smoke.live,
      activeLamps: () => this.lamps.active.length,
      quality: () => this.post.tier,
      speedFx: (s: number) => this.post.effectAt(s),
      carModel: () => this.visual.root.getObjectByName('body') !== undefined,
      renderInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    }
  }
}
