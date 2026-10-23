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
import { CardPanel } from '../ui/card'
import { Hud } from '../ui/hud'
import { skipOverlay } from '../ui/skip'
import { SafeStorage } from '../util/storage'
import { BoxCarVisual, FdCarVisual, type CarVisual } from '../vehicle/carVisual'
import { DriftCar, surfaceOf, type Telemetry } from '../vehicle/driftCar'
import type { Checkpoint } from '../world/checkpoints'
import { greyboxDressing, PropPlacer } from '../world/dressing'
import { Greybox } from '../world/greybox'
import { MountainWorld } from '../world/mountainWorld'
import { ProjectCorners } from '../world/projectCorners'
import type { GameOptions } from './options'
import { RouteRuns } from './routeRun'
import { DriftSession } from './session'

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
  /** the playable world: the mountain, or the flat test pad with ?map=pad */
  private readonly mountain: MountainWorld | null
  private readonly pad: Greybox | null
  private controls: ControlState = idleControls()
  private readonly session: DriftSession
  private readonly hud: Hud
  private readonly cards: CardPanel
  /** the nine project corners (mountain only) */
  private readonly corners: ProjectCorners | null
  /** Rapier reports chassis contacts above the force threshold here (crash rule) */
  private readonly events = new RAPIER.EventQueue(true)
  private railHit = false
  /** hard rail hits since load (debug telemetry) */
  private railHits = 0

  private constructor(
    private readonly engine: Engine,
    private readonly visual: CarVisual,
    quality: QualityTier,
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
    this.mountain = options.map === 'mountain' ? new MountainWorld(scene, this.world) : null
    this.pad = this.mountain ? null : new Greybox(scene, this.world)
    const start = this.startPoint
    this.car = new DriftCar(this.world, start.pos, start.yaw)
    visual.setHeadlights(quality !== 'low')
    scene.add(visual.root)

    this.smoke = new SmokeSystem(scene)
    this.skids = new SkidMarks(scene)
    this.leaves = quality === 'low' ? null : new LeafSystem(scene)
    this.embers = quality === 'high' ? new EmberSystem(scene) : null
    const mountain = this.mountain
    this.camera = new ChaseCamera(engine.camera, mountain ? (x, z) => mountain.heightAt(x, z) : undefined)
    const hudRoot = document.querySelector<HTMLElement>('#hud')!
    this.hud = new Hud(hudRoot)
    // outside the aria-live HUD, so a whole card is not read out on every open
    this.cards = new CardPanel(document.body)
    this.session = new DriftSession(this.mountain?.roads ?? null, this.hud, new RouteRuns(new SafeStorage('drift-folio:')))
    this.corners = this.mountain ? new ProjectCorners(scene, this.mountain.roads) : null
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

  /** Where the car spawns (and resets to before any checkpoint is passed). */
  private get startPoint(): Checkpoint {
    return this.mountain?.start ?? { pos: { x: 0, y: 0, z: 0 }, yaw: 0, edgeId: 'pad' }
  }

  /** Place the world's props, then hand the lamp bulbs to the light pool. */
  private async dress(): Promise<void> {
    if (this.mountain) {
      const mountain = this.mountain
      await Promise.all([mountain.dress(), this.corners?.build((x, z) => mountain.heightAt(x, z))])
      this.lamps.setAnchors([...this.mountain.lamps])
    } else {
      const props = await PropPlacer.place(this.engine.scene, greyboxDressing())
      this.lamps.setAnchors(PropPlacer.anchors(props, 'light_anchor'))
    }
  }

  /** One fixed physics tick. */
  private physicsTick(h: number): void {
    this.car.update(this.controls, h)
    this.world.step(this.events)
    // a hard chassis contact with a guard rail is a crash (spec §8)
    this.events.drainContactForceEvents((e) => {
      if (surfaceOf.get(e.collider1()) === 'rail' || surfaceOf.get(e.collider2()) === 'rail') {
        if (!this.railHit) this.railHits++
        this.railHit = true
      }
    })
    this.car.wheels().forEach((w, i) => this.skids.step(i, w.contact ? w.contactPoint : null, w.slide))
  }

  /** One rendered frame. */
  private frame(rawDt: number): void {
    const dt = Math.min(rawDt, MAX_FRAME)
    const paused = skipOverlay.isOpen
    const fxDt = paused ? 0 : dt
    this.readControls(dt, paused)

    const alpha = paused ? 1 : this.loop.advance(rawDt)
    this.pad?.update()
    const pose = this.car.pose(alpha)
    this.visual.sync(this.car, pose)
    const t: Telemetry = { ...this.car.telemetry(), pos: pose.pos }
    if (!paused) {
      if (this.mountain?.checkpoints.update(t, dt)) this.resetCar()
      this.session.update({ t, dt, railHit: this.railHit, inShortcutZone: false })
      this.railHit = false
      this.mountain?.signposts.update(t)
      const corner = this.corners?.update(t)
      if (corner?.opened) this.cards.show(corner.opened)
      else if (corner?.hinted) this.hud.hint('Drift this corner to open the card')
    }

    this.camera.update(t, dt)
    const camPos = this.engine.camera.position
    this.sky.follow(this.engine.camera)
    this.lighting.update(t.pos, camPos)
    this.lamps.update(camPos)
    this.mountain?.update(this.engine.camera)
    // effects after the camera and lamps so billboards/wrapping use this frame's view
    this.updateEffects(t, fxDt)
    this.post.render(t.speed)
  }

  private readControls(dt: number, paused: boolean): void {
    const c = this.input.read(dt)
    // driving inputs are ignored while the overlay is open
    this.controls = paused ? { ...c, throttle: 0, brake: 0, steer: 0, handbrake: false } : c
    if (c.camera) this.camera.toggleMode()
    if (c.reset) this.resetCar()
  }

  /** R (or an automatic stuck/fell reset): back to the last checkpoint passed, facing down the road. */
  private resetCar(): void {
    const cp = this.mountain?.checkpoints.last ?? this.startPoint
    this.car.resetTo(cp.pos, cp.yaw)
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
      drawnInstances: () => this.mountain?.drawnInstances ?? 0,
      /** jump to a road sample facing along it (screenshots/tests); returns false without a mountain */
      teleport: (edgeId: string, frac: number) => {
        const e = this.mountain?.roads.edge(edgeId)
        if (!e) return false
        const i = Math.round((e.points.length - 1) * frac)
        const t = e.tangent(i)
        this.car.resetTo(e.points[i], Math.atan2(t.x, t.y))
        this.camera.snap()
        return true
      },
      /** jump to a road sample index (screenshots/tests) */
      teleportIndex: (edgeId: string, index: number) => {
        const e = this.mountain?.roads.edge(edgeId)
        if (!e) return false
        const i = Math.max(0, Math.min(e.points.length - 1, index))
        const t = e.tangent(i)
        this.car.resetTo(e.points[i], Math.atan2(t.x, t.y))
        this.camera.snap()
        return true
      },
      /** first hairpin apex of an edge as a 0..1 fraction (or -1) */
      hairpinFrac: (edgeId: string) => {
        const e = this.mountain?.roads.edge(edgeId)
        const i = e?.hairpinApexes()[0]
        return e && i !== undefined ? i / (e.points.length - 1) : -1
      },
      score: () => this.session.score.state(),
      openCard: () => this.cards.openId,
      showCard: (id: string) => this.cards.show(id as never),
      corners: () => this.corners?.spots.map((s) => ({ id: s.id, edgeId: s.edgeId, index: s.index, clip: s.clip, turn: s.turn })) ?? [],
      route: () => this.session.route,
      railHits: () => this.railHits,
      /** drop the car at (x, z) on the ground, facing `yaw` */
      teleportTo: (x: number, z: number, yaw = 0) => {
        const y = this.mountain ? this.mountain.heightAt(x, z) + 0.15 : 0
        this.car.resetTo({ x, y, z }, yaw)
        this.camera.snap()
      },
      /** give the car `speed` m/s along its heading turned by `slipDeg` (left positive): an instant slide */
      launch: (speed: number, slipDeg = 0) => {
        const yaw = this.car.telemetry().yaw + (slipDeg * Math.PI) / 180
        this.car.body.setLinvel({ x: Math.sin(yaw) * speed, y: 0, z: Math.cos(yaw) * speed }, true)
      },
    }
  }
}
