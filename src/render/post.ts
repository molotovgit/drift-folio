import * as THREE from 'three/webgpu'
import type { Node } from 'three/webgpu'
import {
  atan, float, floor, fract, hash, length, luminance, mix, sin, smoothstep, time, toonOutlinePass, uniform, uv, vec2, vec3, vec4,
} from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { palette } from './palette'
import { speedFx } from './speedFx'

export type QualityTier = 'high' | 'mid' | 'low'
export const QUALITY_TIERS: readonly QualityTier[] = ['high', 'mid', 'low']

/** Validate a `?quality=` value (system boundary). */
export function parseTier(v: string | null): QualityTier | null {
  return v && (QUALITY_TIERS as readonly string[]).includes(v) ? (v as QualityTier) : null
}

type V3 = Node<'vec3'>

const BLUR_SAMPLES = 8
/** Outline thickness in clip space (≈2–3 px at 1080p). */
const OUTLINE = { high: 0.006, mid: 0.006, low: 0.0045 } as const

/**
 * The frame's look (spec §5): ink outlines on toon materials, bloom on emissives,
 * speed-scaled radial blur and speed lines, a violet shadow lift and a vignette.
 * Quality tiers drop the expensive passes: mid has no blur/lines, low also no bloom.
 */
export class PostPipeline {
  private readonly pipeline: THREE.RenderPipeline
  /** 0..1 speed-effect strength, updated every frame */
  private readonly fx = uniform(0)
  private readonly violetLift: V3
  private tierValue: QualityTier
  private reducedMotion = false

  constructor(
    renderer: THREE.WebGPURenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    initial: QualityTier = 'high',
  ) {
    const violet = new THREE.Color(palette.skyMid)
    this.violetLift = vec3(violet.r, violet.g, violet.b)
    this.tierValue = initial
    this.pipeline = new THREE.RenderPipeline(renderer)
    this.pipeline.outputNode = this.build(initial)
    // neutral tone mapping keeps the palette's hues (ACES would desaturate them)
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1.05
  }

  get tier(): QualityTier {
    return this.tierValue
  }

  render(speed: number): void {
    this.fx.value = this.effectAt(speed)
    this.pipeline.render()
  }

  setTier(t: QualityTier): void {
    if (t === this.tierValue) return
    this.tierValue = t
    this.pipeline.outputNode = this.build(t)
    this.pipeline.needsUpdate = true
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on
  }

  /** Speed-effect strength used at this speed (0 when reduced motion is on). */
  effectAt(speed: number): number {
    return this.reducedMotion ? 0 : speedFx(speed)
  }

  private build(t: QualityTier) {
    const scenePass = toonOutlinePass(this.scene, this.camera, new THREE.Color(palette.ink), OUTLINE[t], 1)
    const sceneColor = scenePass.getTextureNode()
    const st = uv()
    const d = st.sub(vec2(0.5, 0.5))
    const r = length(d)
    const fx = this.fx

    let col: V3 = sceneColor.rgb
    if (t === 'high') {
      // radial motion blur toward the screen edges, scaled by speed
      let acc: V3 = vec3(0, 0, 0)
      for (let i = 0; i < BLUR_SAMPLES; i++) {
        const k = i / (BLUR_SAMPLES - 1)
        acc = acc.add(sceneColor.sample(st.sub(d.mul(fx.mul(0.07 * k)))).rgb)
      }
      col = mix(col, acc.div(BLUR_SAMPLES), smoothstep(0.12, 0.55, r).mul(fx))
    }
    if (t !== 'low') col = col.add(bloom(sceneColor, 0.55, 0.4, 0.78).rgb)
    if (t === 'high') {
      // speed lines: thin radial streaks near the edges, re-rolled 14×/s
      const cell = floor(atan(d.y, d.x).mul(70))
      const streak = smoothstep(0.93, 1.0, hash(cell.add(floor(time.mul(14))))).mul(smoothstep(0.3, 0.62, r))
      const flicker = fract(sin(cell.mul(12.9898)).mul(43758.5453))
      col = mix(col, vec3(1, 0.96, 0.92), streak.mul(fx).mul(0.35).mul(flicker.mul(0.5).add(0.5)))
    }
    // grade: violet lift in the shadows, warm highlights, gentle vignette
    col = mix(col.add(this.violetLift.mul(0.08)), col.mul(vec3(1.05, 0.98, 0.95)), smoothstep(0.05, 0.6, luminance(col)))
    col = col.mul(float(1).sub(smoothstep(0.42, 0.95, r).mul(0.42)))
    return vec4(col, 1)
  }
}
