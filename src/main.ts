import './styles/base.css'
import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { createChaseCamera } from './camera/chaseCamera'
import { createEngine, detectGpu, type GpuNavigator } from './core/engine'
import { createInput } from './core/input'
import { createFixedLoop, MAX_FRAME, PHYSICS_STEP } from './core/loop'
import { palette } from './render/palette'
import { isSkipOpen, openSkipOverlay } from './ui/skip'
import { createBoxCarVisual } from './vehicle/carVisual'
import { createDriftCar } from './vehicle/driftCar'
import { buildGreybox } from './world/greybox'
import { groundHeight } from './world/ground'

const debug = new URLSearchParams(location.search).has('debug')

async function boot() {
  const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
  document.querySelector('#skip-link')!.addEventListener('click', () => openSkipOverlay('user'))

  const tier = await detectGpu(navigator as unknown as GpuNavigator, canvas)
  document.documentElement.dataset.gpu = tier
  if (tier === 'none') return openSkipOverlay('no-gpu')

  const [engine] = await Promise.all([createEngine(canvas, tier), RAPIER.init()])
  engine.onContextLost(() => openSkipOverlay('context-lost'))
  const { scene, camera, renderer } = engine

  scene.fog = new THREE.Fog(palette.fog, 60, 320)
  scene.add(new THREE.HemisphereLight(palette.skyHorizon, palette.terrainShadow, 1.4))
  const sun = new THREE.DirectionalLight(palette.sunGlow, 2.2)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 })
  scene.add(sun, sun.target)

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = PHYSICS_STEP
  const greybox = buildGreybox(scene, world)
  const car = createDriftCar(world, { x: 0, y: 0, z: 0 }, 0)
  const visual = createBoxCarVisual()
  scene.add(visual.root)
  const input = createInput(window)
  const cam = createChaseCamera(camera)

  let controls = input.read(0)
  const loop = createFixedLoop(PHYSICS_STEP, MAX_FRAME, (h) => {
    car.update(controls, h)
    world.step()
  })

  engine.onFrame((dt) => {
    const paused = isSkipOpen()
    controls = input.read(Math.min(dt, MAX_FRAME))
    if (paused) controls = { ...controls, throttle: 0, brake: 0, steer: 0, handbrake: false }
    if (controls.camera) cam.toggleMode()
    if (controls.reset) {
      const t = car.telemetry()
      car.resetTo({ x: t.pos.x, y: groundHeight(world, t.pos.x, t.pos.z, car.body), z: t.pos.z }, t.yaw)
      cam.snap()
    }
    const alpha = paused ? 1 : loop.advance(dt)
    greybox.update()
    const pose = car.pose(alpha)
    visual.sync(car, pose)
    const t = { ...car.telemetry(), pos: pose.pos }
    cam.update(t, Math.min(dt, MAX_FRAME))
    sun.position.set(t.pos.x - 20, 40, t.pos.z + 15)
    sun.target.position.set(t.pos.x, 0, t.pos.z)
    renderer.render(scene, camera)
  })

  if (debug) {
    ;(window as unknown as { __drift: unknown }).__drift = {
      telemetry: () => car.telemetry(),
      wheels: () => car.wheels(),
      cameraY: () => camera.position.y - car.telemetry().pos.y,
    }
  }
  document.documentElement.dataset.ready = '1'
}

boot().catch((err) => {
  console.error(err)
  openSkipOverlay('no-gpu')
})
