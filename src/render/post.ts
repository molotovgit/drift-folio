import * as THREE from 'three/webgpu'
import type { Node } from 'three/webgpu'
import {
  atan, float, floor, fract, hash, length, luminance, mix, sin, smoothstep, time, toonOutlinePass, uniform, uv, vec2, vec3, vec4,
} from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { palette } from './palette'
import { speedFx } from './speedFx'

export type QualityTier = 'high' | 'mid' | 'low'

const BLUR_SAMPLES = 8
type V3 = Node<'vec3'>

export interface Post {
  render(speed: number): void
  setTier(t: QualityTier): void
  setReducedMotion(on: boolean): void
  /** the speed-effect strength that would be used at this speed (0 when reduced motion is on) */
  effectAt(speed: number): number
  readonly tier: QualityTier
}

export function createPost(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, initial: QualityTier = 'high'): Post {
  const pipeline = new THREE.RenderPipeline(renderer)
  const fx = uniform(0) // 0..1 speed effects strength
  let outlineThickness = 0.0028
  let tier: QualityTier = initial
  let reducedMotion = false

  const violet = new THREE.Color(palette.skyMid)
  const violetLift = vec3(violet.r, violet.g, violet.b)

  function build(t: QualityTier) {
    const scenePass = toonOutlinePass(scene, camera, new THREE.Color(palette.ink), outlineThickness, 1)
    const sceneColor = scenePass.getTextureNode()
    const st = uv()
    const d = st.sub(vec2(0.5, 0.5))
    const r = length(d)

    let col: V3 = sceneColor.rgb
    if (t === 'high') {
      // radial motion blur toward the screen edges, scaled by speed
      let acc: V3 = vec3(0, 0, 0)
      for (let i = 0; i < BLUR_SAMPLES; i++) {
        const k = i / (BLUR_SAMPLES - 1)
        acc = acc.add(sceneColor.sample(st.sub(d.mul(fx.mul(0.07 * k)))).rgb)
      }
      const blurred = acc.div(BLUR_SAMPLES)
      col = mix(col, blurred, smoothstep(0.12, 0.55, r).mul(fx))
    }
    if (t !== 'low') {
      const glow = bloom(sceneColor, 0.55, 0.4, 0.78)
      col = col.add(glow.rgb)
    }
    if (t === 'high') {
      // speed lines: thin radial streaks near the edges
      const a = atan(d.y, d.x)
      const cell = floor(a.mul(70))
      const seed = hash(cell.add(floor(time.mul(14))))
      const streak = smoothstep(0.93, 1.0, seed).mul(smoothstep(0.3, 0.62, r))
      const flicker = fract(sin(cell.mul(12.9898)).mul(43758.5453))
      col = mix(col, vec3(1, 0.96, 0.92), streak.mul(fx).mul(0.35).mul(flicker.mul(0.5).add(0.5)))
    }
    // grade: violet lift in the shadows, warm highlights, gentle vignette
    const lum = luminance(col)
    col = mix(col.add(violetLift.mul(0.08)), col.mul(vec3(1.05, 0.98, 0.95)), smoothstep(0.05, 0.6, lum))
    col = col.mul(float(1).sub(smoothstep(0.42, 0.95, r).mul(0.42)))
    return vec4(col, 1)
  }

  pipeline.outputNode = build(tier)
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.05

  return {
    get tier() {
      return tier
    },
    render(speed: number) {
      fx.value = reducedMotion ? 0 : speedFx(speed)
      pipeline.render()
    },
    setTier(t: QualityTier) {
      if (t === tier) return
      tier = t
      outlineThickness = t === 'low' ? 0.0022 : 0.0028
      pipeline.outputNode = build(t)
      pipeline.needsUpdate = true
    },
    setReducedMotion(on: boolean) {
      reducedMotion = on
    },
    effectAt(speed: number) {
      return reducedMotion ? 0 : speedFx(speed)
    },
  }
}
