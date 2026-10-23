/**
 * Small Web Audio helpers shared by the sound classes.
 */

/** Time constant for per-frame parameter glides, seconds (~3τ ≈ 90 ms to settle; no zipper noise). */
export const GLIDE_TAU = 0.03

/** Move `param` toward `value` smoothly from now; safe to call every frame. */
export function glide(param: AudioParam, value: number, ctx: BaseAudioContext, tau = GLIDE_TAU): void {
  if (!Number.isFinite(value)) return
  param.setTargetAtTime(value, ctx.currentTime, tau)
}

/** Mono white-noise buffer, `seconds` long, for looping noise sources and bursts. */
export function createNoiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** Started, looping playback of `buffer` (caller connects it). */
export function loopSource(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  src.start()
  return src
}

/** Gain node with an initial value (most of ours start silent and glide in). */
export function gainNode(ctx: BaseAudioContext, value = 0): GainNode {
  const g = ctx.createGain()
  g.gain.value = value
  return g
}

/** Biquad filter preset. */
export function filterNode(ctx: BaseAudioContext, type: BiquadFilterType, hz: number, q = 1): BiquadFilterNode {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = hz
  f.Q.value = q
  return f
}

/** Chain nodes in order; returns the last one for further connection. */
export function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1])
  return nodes[nodes.length - 1]
}
