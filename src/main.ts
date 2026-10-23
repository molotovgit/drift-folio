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
import { createPost, type QualityTier } from './render/post'
import { createSky } from './render/sky'
import { isSkipOpen, openSkipOverlay } from './ui/skip'
import { createBoxCarVisual, loadCarVisual, type CarVisual } from './vehicle/carVisual'
import { createDriftCar } from './vehicle/driftCar'
import { buildGreybox } from './world/greybox'
import { greyboxDressing, lampLight, placeModels } from './world/dressing'
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

  const qualityParam = params.get('quality') as QualityTier | null
  const quality: QualityTier = qualityParam ?? (engine.isMobile ? 'mid' : 'high')
  const post = createPost(renderer, scene, camera, quality)
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
  post.setReducedMotion(reduceMotion.matches)
  reduceMotion.addEventListener('change', (e) => post.setReducedMotion(e.matches))

  // ---- world + car ----
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = PHYSICS_STEP
  const greybox = buildGreybox(scene, world)
  const dressing = placeModels(scene, greyboxDressing())
  // warm lamp lights at each lamp head (lamp arm reaches toward -X in model space)
  dressing.then((g) => {
    g.traverse((o) => {
      if (o.name === 'light_anchor') {
        const l = lampLight()
        o.add(l)
      }
    })
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

  const smoke = createSmoke(scene, quality === 'high' ? 260 : 140)
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
    smoke.update(dt)
    skids.flush()

    cam.update(t, dt)
    sky.follow(camera)
    leaves?.update(dt, camera.position, wind)
    sun.position.set(t.pos.x - 45, 26, t.pos.z + 70)
    sun.target.position.set(t.pos.x, 0, t.pos.z)
    post.render(t.speed)
  })

  if (debug) {
    ;(window as unknown as { __drift: unknown }).__drift = {
      telemetry: () => car.telemetry(),
      wheels: () => car.wheels(),
      cameraY: () => camera.position.y - car.telemetry().pos.y,
      skidCount: () => skids.buffer.count,
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
