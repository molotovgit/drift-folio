import './styles/base.css'
import * as THREE from 'three/webgpu'
import { createEngine, detectGpu } from './core/engine'
import { palette } from './render/palette'
import { openSkipOverlay } from './ui/skip'

async function boot() {
  const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
  document.querySelector('#skip-link')!.addEventListener('click', () => openSkipOverlay('user'))

  const tier = await detectGpu(navigator as never, canvas)
  document.documentElement.dataset.gpu = tier
  if (tier === 'none') return openSkipOverlay('no-gpu')

  const engine = await createEngine(canvas, tier)
  engine.onContextLost(() => openSkipOverlay('context-lost'))
  const { scene, camera, renderer } = engine
  scene.background = new THREE.Color(palette.skyMid)
  camera.position.set(3, 2, 5)
  camera.lookAt(0, 0, 0)

  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 3.4), new THREE.MeshToonMaterial({ color: palette.carTeal }))
  scene.add(cube, new THREE.HemisphereLight(palette.skyHorizon, palette.terrainShadow, 1.2))
  const sun = new THREE.DirectionalLight(palette.sunGlow, 2)
  sun.position.set(-5, 6, 3)
  scene.add(sun)

  engine.onFrame((dt) => {
    cube.rotation.y += dt * 0.6
    renderer.render(scene, camera)
  })
  document.documentElement.dataset.ready = '1'
}

boot().catch((err) => {
  console.error(err)
  openSkipOverlay('no-gpu')
})
