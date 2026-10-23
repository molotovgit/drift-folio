import './styles/base.css'
import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { createChaseCamera } from './camera/chaseCamera'
import { createEngine, detectGpu, type GpuNavigator } from './core/engine'
import { createInput } from './core/input'
import { createFixedLoop, MAX_FRAME, PHYSICS_STEP } from './core/loop'
import { createLeaves } from './fx/leaves'
import { createSkids } from './fx/skids'
import { createSmoke, smokeGate } from './fx/smoke'
import { palette } from './render/palette'
import { createPost, parseTier, type QualityTier } from './render/post'
import { createLightPool } from './render/lightPool'
import { createEmbers } from './fx/embers'
import { createSky } from './render/sky'
import { isSkipOpen, openSkipOverlay } from './ui/skip'
import { createBoxCarVisual, loadCarVisual, type CarVisual } from './vehicle/carVisual'
import { createDriftCar } from './vehicle/driftCar'
import { buildGreybox } from './world/greybox'
import { greyboxDressing, placeModels } from './world/dressing'
import { groundHeight } from './world/ground'

const params = new URLSearchParams(location.search)
const debug = params.has('debug')
// test-only: let slow software renderers catch up more physics ticks per frame (same physics, just faster wall-clock)
const maxFrame = debug && params.has('catchup') ? 10 / 60 : MAX_FRAME

async function boot() {
  const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
  document.querySelector('#skip-link')!.addEventListener('click', () => openSkipOverlay('user'))

  const tier = await detectGpu(navigator as unknown as GpuNavigator, canvas)
  document.documentElement.dataset.gpu = tier
  if (tier === 'none') return openSkipOverlay('no-gpu')

  const [engine] = await Promise.all([createEngine(canvas, tier), RAPIER.init()])
  engine.onContextLost(() => openSkipOverlay('context-lost'))
  const { scene, camera, renderer } = engine

  // ---- look (spec §5) ----
  const sky = createSky()
  scene.add(sky.mesh)
  scene.fog = new THREE.Fog(palette.fog, 70, 420)
  scene.add(new THREE.HemisphereLight(palette.skyHorizon, palette.terrainShadow, 2.0))
  // low sun behind the ridge: warm rim light from the back-left
  const sun = new THREE.DirectionalLight(palette.sunGlow, 2.4)
  sun.castShadow = true
  sun.shadow.mapSize.set(engine.isMobile ? 1024 : 2048, engine.isMobile ? 1024 : 2048)
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 160 })
  sun.shadow.bias = -0.0005
  scene.add(sun, sun.target)
  const fill = new THREE.DirectionalLight(palette.skyMid, 0.5)
  fill.position.set(30, 20, -40)
  scene.add(fill)

  const qualityParam = parseTier(params.get('quality'))
  const quality: QualityTier = qualityParam ?? (engine.isMobile ? 'mid' : 'high')
  const post = createPost(renderer, scene, camera, quality)
  if (quality === 'low') engine.setPixelRatioCap(1)
  // rim light from behind the car (moved each frame opposite the camera)
  const rim = new THREE.DirectionalLight(palette.skyHorizon, 1.3)
  scene.add(rim, rim.target)
  const lamps = createLightPool(scene, engine.isMobile ? 2 : 4)
  const embers = quality === 'high' ? createEmbers(scene) : null
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
  post.setReducedMotion(reduceMotion.matches)
  reduceMotion.addEventListener('change', (e) => post.setReducedMotion(e.matches))

  // ---- world + car ----
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = PHYSICS_STEP
  const greybox = buildGreybox(scene, world)
  const dressing = placeModels(scene, greyboxDressing())
  // lamp bulbs feed the fixed light pool (lights exist from boot, so no shader recompiles)
  dressing.then((g) => {
    g.updateMatrixWorld(true)
    const anchors: THREE.Vector3[] = []
    g.traverse((o) => {
      if (o.name === 'light_anchor') anchors.push(o.getWorldPosition(new THREE.Vector3()))
    })
    lamps.setAnchors(anchors)
  })
  const car = createDriftCar(world, { x: 0, y: 0, z: 0 }, 0)
  let visual: CarVisual
  try {
    visual = await loadCarVisual()
  } catch (err) {
    console.warn('FD model failed to load, using the grey-box car', err)
    visual = createBoxCarVisual()
  }
  visual.setHeadlights(quality !== 'low')
  scene.add(visual.root)

  const smoke = createSmoke(scene)
  const skids = createSkids(scene)
  const leaves = quality === 'low' ? null : createLeaves(scene)
  const wind = new THREE.Vector3(0.9, 0, 0.4)

  const input = createInput(window)
  const cam = createChaseCamera(camera)

  let controls = input.read(0)
  const loop = createFixedLoop(PHYSICS_STEP, maxFrame, (h) => {
    car.update(controls, h)
    world.step()
    car.wheels().forEach((w, i) => skids.step(i, w.contact ? w.contactPoint : null, w.slide))
  })

  engine.onFrame((rawDt) => {
    const dt = Math.min(rawDt, MAX_FRAME)
    const paused = isSkipOpen()
    controls = input.read(dt)
    if (paused) controls = { ...controls, throttle: 0, brake: 0, steer: 0, handbrake: false }
    if (controls.camera) cam.toggleMode()
    if (controls.reset) {
      const t = car.telemetry()
      car.resetTo({ x: t.pos.x, y: groundHeight(world, t.pos.x, t.pos.z, car.body), z: t.pos.z }, t.yaw)
      cam.snap()
    }
    const alpha = paused ? 1 : loop.advance(rawDt)
    greybox.update()
    const pose = car.pose(alpha)
    visual.sync(car, pose)
    const t = { ...car.telemetry(), pos: pose.pos }

    // smoke from the rear tyres
    const wheels = car.wheels()
    for (const i of [2, 3]) {
      const w = wheels[i]
      if (w.contact) smoke.emit(w.contactPoint, smokeGate(t.drifting, w.slide), t.vel, paused ? 0 : dt)
    }
    smoke.update(paused ? 0 : dt, camera)
    skids.flush()

    cam.update(t, dt)
    sky.follow(camera)
    leaves?.update(dt, camera.position, wind)
    sun.position.set(t.pos.x - 45, 26, t.pos.z + 70)
    sun.target.position.set(t.pos.x, 0, t.pos.z)
    rim.target.position.set(t.pos.x, t.pos.y, t.pos.z)
    rim.position.set(t.pos.x * 2 - camera.position.x, t.pos.y + 3, t.pos.z * 2 - camera.position.z)
    lamps.update(camera.position)
    if (embers) {
      embers.setSources(lamps.lights.filter((l) => l.intensity > 0).map((l) => l.position))
      embers.update(paused ? 0 : dt, camera)
    }
    post.render(t.speed)
  })

  if (debug) {
    ;(window as unknown as { __drift: unknown }).__drift = {
      telemetry: () => car.telemetry(),
      wheels: () => car.wheels(),
      cameraY: () => camera.position.y - car.telemetry().pos.y,
      skidCount: () => skids.buffer.count,
      smokeLive: () => smoke.live,
      activeLamps: () => lamps.lights.filter((l) => l.intensity > 0).length,
      quality: () => post.tier,
      speedFx: (s: number) => post.effectAt(s),
      carModel: () => visual.root.getObjectByName('body') !== undefined,
      renderInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    }
  }
  await dressing
  document.documentElement.dataset.ready = '1'
}

boot().catch((err) => {
  console.error(err)
  openSkipOverlay('no-gpu')
})
