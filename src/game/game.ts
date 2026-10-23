import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { surfaceOf as audioSurface } from '../audio/audioMath'
import { AudioSystem } from '../audio/audioSystem'
import { ChaseCamera } from '../camera/chaseCamera'
import { Engine, type GpuTier } from '../core/engine'
import { idleControls, InputController, type ControlState } from '../core/input'
import { FixedStepLoop, MAX_FRAME, PHYSICS_STEP } from '../core/loop'
import { PerfGovernor } from '../core/perfGovernor'
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
import { TouchControls } from '../ui/touch'
import { SafeStorage } from '../util/storage'
import { BoxCarVisual, FdCarVisual, HyperVCarVisual, type CarVisual } from '../vehicle/carVisual'
import { DriftCar, surfaceOf, type Telemetry } from '../vehicle/driftCar'
import type { Checkpoint } from '../world/checkpoints'
import { greyboxDressing, PropPlacer } from '../world/dressing'
import { Greybox } from '../world/greybox'
import { MountainWorld } from '../world/mountainWorld'
import { DebugHooks } from './debugHooks'
import { KeySequence } from './easterEggs'
import { MountainFeatures } from './mountainFeatures'
import type { GameOptions } from './options'
import { RouteRuns } from './routeRun'
import { DriftSession } from './session'

const REAR_WHEELS = [2, 3] as const
const WIND = new THREE.Vector3(0.9, 0, 0.4)
/** chassis contacts with these surfaces crash the running score (spec §8) */
const CRASH_SURFACES = new Set(['rail', 'train'])

/**
 * The running game: owns the engine, physics world, car, effects, camera,
 * post pipeline, audio and the session rules, and drives them from one frame
 * callback. Physics ticks at a fixed 60 Hz; rendering interpolates between
 * ticks. Mountain gameplay features live in MountainFeatures.
 */
export class Game {
  private readonly world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
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
  private readonly features: MountainFeatures | null
  private readonly session: DriftSession
  private readonly hud: Hud
  private readonly cards: CardPanel
  /** synthesised engine, tyres, ambience and effects (silent until the first input) */
  private readonly audio: AudioSystem
  /** steps quality down on slow devices (null when a tier is forced) */
  private readonly governor: PerfGovernor | null
  /** Rapier reports chassis contacts above the force threshold here (crash rule) */
  private readonly events = new RAPIER.EventQueue(true)
  private controls: ControlState = idleControls()
  private crashed = false
  /**
   * Seconds of unpaused play (frame times clamped like physics). Timers on the
   * mountain (gymkhana, train timetable) use it so a pause never counts.
   */
  private playClock = 0
  /** hard rail/train hits since load (debug telemetry) */
  private crashCount = 0

  private constructor(
    private readonly engine: Engine,
    private visual: CarVisual,
    quality: QualityTier,
    options: GameOptions,
  ) {
    const { scene } = engine
    const storage = new SafeStorage('drift-folio:')
    this.world.timestep = PHYSICS_STEP

    // look
    scene.add(this.sky.mesh)
    this.lighting = new SceneLighting(scene, engine.isMobile)
    this.lamps = new LightPool(scene, engine.isMobile ? 2 : 4)
    this.post = new PostPipeline(engine.renderer, scene, engine.camera, quality)
    if (quality === 'low') engine.setPixelRatioCap(1)
    this.watchReducedMotion()
    this.governor = options.adaptive ? new PerfGovernor(quality) : null

    // world + car
    this.mountain = options.map === 'mountain' ? new MountainWorld(scene, this.world) : null
    this.pad = this.mountain ? null : new Greybox(scene, this.world)
    const start = this.startPoint
    this.car = new DriftCar(this.world, start.pos, start.yaw)
    visual.setHeadlights(quality !== 'low')
    scene.add(visual.root)
    const mountain = this.mountain
    this.camera = new ChaseCamera(engine.camera, mountain ? (x, z) => mountain.heightAt(x, z) : undefined)

    // effects
    this.smoke = new SmokeSystem(scene)
    this.skids = new SkidMarks(scene)
    this.leaves = quality === 'low' ? null : new LeafSystem(scene)
    this.embers = quality === 'high' ? new EmberSystem(scene) : null

    // rules, HUD, sound
    const hudRoot = document.querySelector<HTMLElement>('#hud')!
    this.hud = new Hud(hudRoot)
    // outside the aria-live HUD, so a whole card is not read out on every open
    this.cards = new CardPanel(document.body)
    this.session = new DriftSession(mountain?.roads ?? null, this.hud, new RouteRuns(storage))
    this.audio = new AudioSystem({ storage })
    this.session.scoreListener = (e) => this.audio.event(e)
    const touch = TouchControls.wanted() ? new TouchControls() : null
    this.features = mountain
      ? new MountainFeatures({ scene, world: this.world, mountain, storage, hud: this.hud, cards: this.cards, session: this.session, touch, setPaint: (hex) => this.visual.setPaint(hex) })
      : null

    // input
    if (touch) this.input.addSource(touch)
    // browsers only allow audio after a user gesture: unlock on the first input of any kind
    for (const type of ['keydown', 'pointerdown', 'touchstart']) window.addEventListener(type, () => this.audio.unlock(), { capture: true, passive: true })
    // ↑↑↓↓←→←→BA swaps the FD for a Hyper-V host on wheels
    new KeySequence(() => this.swapVisual(new HyperVCarVisual(), 'Hyper-V host on wheels')).listen(window)

    this.loop = new FixedStepLoop(PHYSICS_STEP, options.maxFrame, (h) => this.physicsTick(h))
    engine.onFrame((dt) => this.frame(dt))
  }

  /** Initialise everything (renderer, physics wasm, car model, props) and start the loop. */
  static async start(
    canvas: HTMLCanvasElement,
    tier: Exclude<GpuTier, 'none'>,
    options: GameOptions,
    progress: (fraction: number, what: string) => void = () => {},
  ): Promise<Game> {
    progress(0.1, 'Starting the engine…')
    const [engine] = await Promise.all([Engine.create(canvas, tier), RAPIER.init()])
    engine.onContextLost(() => skipOverlay.open('context-lost'))
    progress(0.3, 'Rolling the FD out…')
    const visual = await FdCarVisual.load().catch((err) => {
      console.warn('FD model failed to load, using the grey-box car', err)
      return new BoxCarVisual()
    })
    progress(0.45, 'Building the mountain…')
    const game = new Game(engine, visual, options.qualityFor(engine.isMobile), options)
    progress(0.75, 'Planting maples, hanging lanterns…')
    await game.dress()
    progress(1, 'Ready')
    if (options.debug) game.installDebugHooks()
    return game
  }

  /** Where the car spawns (and resets to before any checkpoint is passed). */
  private get startPoint(): Checkpoint {
    return this.mountain?.start ?? { pos: { x: 0, y: 0, z: 0 }, yaw: 0, edgeId: 'pad' }
  }

  /** Place the world's props, then hand the lamp bulbs to the light pool. */
  private async dress(): Promise<void> {
    if (this.mountain) {
      await Promise.all([this.mountain.dress(this.post.tier), this.features?.build()])
      this.lamps.setAnchors([...this.mountain.lamps])
      return
    }
    const props = await PropPlacer.place(this.engine.scene, greyboxDressing())
    this.lamps.setAnchors(PropPlacer.anchors(props, 'light_anchor'))
  }

  /** One fixed physics tick. */
  private physicsTick(h: number): void {
    this.car.update(this.controls, h)
    this.features?.tick(h)
    this.world.step(this.events)
    this.events.drainContactForceEvents((e) => {
      if (!CRASH_SURFACES.has(surfaceOf.get(e.collider1()) ?? '') && !CRASH_SURFACES.has(surfaceOf.get(e.collider2()) ?? '')) return
      if (!this.crashed) {
        this.crashCount++
        this.audio.event({ type: 'crash', value: 0 })
      }
      this.crashed = true
    })
    this.car.wheels().forEach((w, i) => this.skids.step(i, w.contact ? w.contactPoint : null, w.slide))
  }

  /** One rendered frame. */
  private frame(rawDt: number): void {
    this.adaptQuality(rawDt)
    const dt = Math.min(rawDt, MAX_FRAME)
    const paused = skipOverlay.isOpen
    this.readControls(dt, paused)

    const alpha = paused ? 1 : this.loop.advance(rawDt)
    this.pad?.update()
    const pose = this.car.pose(alpha)
    this.visual.sync(this.car, pose)
    const t: Telemetry = { ...this.car.telemetry(), pos: pose.pos }
    if (!paused) this.updateRules(t, dt)

    this.camera.update(t, dt)
    const camPos = this.engine.camera.position
    this.sky.follow(this.engine.camera)
    this.lighting.update(t.pos, camPos)
    this.lamps.update(camPos)
    this.mountain?.update(this.engine.camera)
    this.updateAudio(t)
    // effects after the camera and lamps so billboards/wrapping use this frame's view
    this.updateEffects(t, paused ? 0 : dt)
    this.post.render(t.speed)
  }

  /** Checkpoints, mountain features, then scoring (which needs this frame's crash/dirt state). */
  private updateRules(t: Telemetry, dt: number): void {
    this.playClock += dt
    const now = this.playClock
    if (this.mountain?.checkpoints.update(t, dt)) this.resetCar()
    this.mountain?.signposts.update(t)
    this.features?.update(t, dt, now)
    this.session.update({ t, dt, railHit: this.crashed, inShortcutZone: this.features?.inDirt ?? false })
    this.crashed = false
  }

  private readControls(dt: number, paused: boolean): void {
    const c = this.input.read(dt)
    // driving inputs are ignored while the overlay is open
    this.controls = paused ? { ...c, throttle: 0, brake: 0, steer: 0, handbrake: false } : c
    if (c.camera) this.camera.toggleMode()
    if (c.mute) this.hud.hint(this.audio.toggleMute() ? 'Sound off (M)' : 'Sound on (M)')
    if (c.reset) this.resetCar()
  }

  /** R (or an automatic stuck/fell reset): back to the last checkpoint passed, facing down the road. */
  private resetCar(): void {
    this.audio.event({ type: 'reset' })
    const cp = this.mountain?.checkpoints.last ?? this.startPoint
    this.car.resetTo(cp.pos, cp.yaw)
    this.camera.snap()
  }

  /** Let the governor step quality down on slow devices; give up → text version. */
  private adaptQuality(rawDt: number): void {
    const action = this.governor?.frame(rawDt)
    if (!action) return
    if (action.type === 'give-up') {
      skipOverlay.open('slow')
      return
    }
    this.post.setTier(action.tier)
    this.mountain?.setTier(action.tier)
    if (action.tier === 'low') {
      this.engine.setPixelRatioCap(1)
      this.visual.setHeadlights(false)
    }
  }

  /** Replace the car's look (easter egg); physics is unchanged. */
  private swapVisual(next: CarVisual, hint: string): void {
    this.engine.scene.remove(this.visual.root)
    this.visual = next
    next.setHeadlights(this.post.tier !== 'low') // the low tier runs without headlights
    this.engine.scene.add(next.root)
    this.hud.hint(hint)
  }

  private updateAudio(t: Telemetry): void {
    this.audio.update({
      speed: t.speed,
      throttle: this.controls.throttle,
      slipDeg: t.slipDeg,
      drifting: t.drifting,
      wheelsOnGround: t.wheelsOnGround,
      surface: audioSurface(t),
      horn: this.controls.horn,
      zone: this.session.route === 'town' ? 'town' : 'mountain',
    })
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

  private installDebugHooks(): void {
    DebugHooks.install({
      engine: this.engine,
      car: this.car,
      camera: this.camera,
      visual: () => this.visual,
      skids: this.skids,
      smoke: this.smoke,
      lamps: this.lamps,
      post: this.post,
      session: this.session,
      cards: this.cards,
      audio: this.audio,
      mountain: this.mountain,
      features: this.features,
      crashCount: () => this.crashCount,
    })
  }
}
