import type { Vec3 } from '../core/math'

/**
 * Ghost lap (spec §8, plan 7.7): record a run as 20 Hz pose samples, store it as
 * compact JSON, play it back as a translucent car.
 *
 * Yaw convention matches DriftCar telemetry: yaw = atan2(fwd.x, fwd.z), radians,
 * 0 = facing +Z, positive turns left (toward +X). Positions are world metres
 * (the car body's translation, the same point `DriftCar.pose().pos` renders).
 */

/** One recorded pose. `t` is seconds since the start of the run. */
export interface GhostSample {
  t: number
  x: number
  y: number
  z: number
  yaw: number
}

/** A recorded run: samples in ascending `t`. */
export interface GhostRecording {
  /** nominal sample rate the recorder used, Hz */
  hz: number
  samples: GhostSample[]
}

/** Pose input to the recorder and output of the player. */
export interface GhostPose {
  pos: Vec3
  yaw: number
}

export const GHOST_HZ = 20
/** encoding format version; bump if the layout below changes */
const FORMAT = 1
/** positions are quantised to centimetres */
const POS_Q = 100
/** yaw is quantised to milliradians */
const YAW_Q = 1000
/** time is quantised to milliseconds */
const T_Q = 1000

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  const w = a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI))
  return w === -Math.PI ? Math.PI : w
}

/**
 * Collects pose samples at GHOST_HZ from a caller that ticks faster (the 60 Hz
 * physics loop): `sample` keeps a pose only once a full sample period has passed.
 */
export class GhostRecorder {
  private samples: GhostSample[] = []
  private nextT = 0
  private recording = false

  constructor(private readonly hz = GHOST_HZ) {}

  /** Begin a fresh recording (drops anything recorded before). */
  start(): void {
    this.samples = []
    this.nextT = 0
    this.recording = true
  }

  /** Offer the pose at run time `t` seconds; stored if a sample is due. Ignored when not recording. */
  sample(t: number, pose: GhostPose): void {
    if (!this.recording || t + 1e-9 < this.nextT) return
    this.samples.push({ t, x: pose.pos.x, y: pose.pos.y, z: pose.pos.z, yaw: wrapAngle(pose.yaw) })
    // step from the schedule, not from t, so the rate stays exact when ticks jitter
    this.nextT = Math.max(this.nextT + 1 / this.hz, t + 0.5 / this.hz)
  }

  /** Finish and return the recording. Further samples are ignored until `start`. */
  stop(): GhostRecording {
    this.recording = false
    return { hz: this.hz, samples: this.samples }
  }
}

/** A copy of `rec` with every timestamp multiplied by `factor` (1.1 = a 10% slower ghost). */
export function scaleGhostTime(rec: GhostRecording, factor: number): GhostRecording {
  return { hz: rec.hz / factor, samples: rec.samples.map((s) => ({ ...s, t: s.t * factor })) }
}

/** On-disk layout: quantised, delta-encoded integer columns. */
interface EncodedGhost {
  v: number
  hz: number
  /** delta-encoded columns; first entry of each is the absolute quantised value */
  t: number[]
  x: number[]
  y: number[]
  z: number[]
  yaw: number[]
}

/**
 * Quantise then delta-encode a column. Deltas are taken between quantised
 * values, so decoding accumulates no rounding drift (error stays ≤ q/2).
 */
function deltaEncode(values: number[], q: number): number[] {
  let prev = 0
  return values.map((v) => {
    const iv = Math.round(v * q)
    const d = iv - prev
    prev = iv
    return d
  })
}

function deltaDecode(deltas: number[], q: number): number[] {
  let acc = 0
  return deltas.map((d) => (acc += d) / q)
}

/** Unwrap yaw so consecutive values never jump by 2π (keeps yaw deltas small). */
function unwrapYaw(yaws: number[]): number[] {
  const out: number[] = []
  for (const y of yaws) out.push(out.length ? out[out.length - 1] + wrapAngle(y - out[out.length - 1]) : y)
  return out
}

/** Compact JSON for a recording: ~4 bytes per value at driving speeds. */
export function encodeGhost(rec: GhostRecording): string {
  const s = rec.samples
  const enc: EncodedGhost = {
    v: FORMAT,
    hz: rec.hz,
    t: deltaEncode(s.map((p) => p.t), T_Q),
    x: deltaEncode(s.map((p) => p.x), POS_Q),
    y: deltaEncode(s.map((p) => p.y), POS_Q),
    z: deltaEncode(s.map((p) => p.z), POS_Q),
    yaw: deltaEncode(unwrapYaw(s.map((p) => p.yaw)), YAW_Q),
  }
  return JSON.stringify(enc)
}

/** Inverse of `encodeGhost`. Throws on a malformed or unknown-version payload. */
export function decodeGhost(text: string): GhostRecording {
  const e = JSON.parse(text) as Partial<EncodedGhost>
  const cols = [e.t, e.x, e.y, e.z, e.yaw]
  if (e.v !== FORMAT || typeof e.hz !== 'number' || !cols.every(Array.isArray)) throw new Error('decodeGhost: bad ghost payload')
  const n = e.t!.length
  if (!cols.every((c) => c!.length === n)) throw new Error('decodeGhost: column lengths differ')
  const [t, x, y, z] = [deltaDecode(e.t!, T_Q), deltaDecode(e.x!, POS_Q), deltaDecode(e.y!, POS_Q), deltaDecode(e.z!, POS_Q)]
  const yaw = deltaDecode(e.yaw!, YAW_Q)
  return { hz: e.hz, samples: t.map((ti, i) => ({ t: ti, x: x[i], y: y[i], z: z[i], yaw: wrapAngle(yaw[i]) })) }
}

/**
 * Plays a recording back: `poseAt(runTime)` gives the ghost's interpolated pose
 * (linear position, shortest-arc yaw). Before the first sample the ghost waits
 * on the grid; after the last it is gone (null).
 */
export class GhostPlayer {
  private readonly samples: readonly GhostSample[]
  /** last bracket index found; playback is monotonic, so the search usually starts here */
  private cursor = 0

  constructor(rec: GhostRecording) {
    if (!rec.samples.length) throw new Error('GhostPlayer: empty recording')
    this.samples = rec.samples
  }

  /** Length of the run in seconds (time of the last sample). */
  get duration(): number {
    return this.samples[this.samples.length - 1].t
  }

  /** Pose at run time `t` seconds, or null once the run has finished. */
  poseAt(t: number): GhostPose | null {
    const s = this.samples
    if (t > this.duration) return null
    if (t <= s[0].t) return { pos: { x: s[0].x, y: s[0].y, z: s[0].z }, yaw: s[0].yaw }
    const i = this.bracket(t)
    const a = s[i]
    const b = s[i + 1] ?? a
    const span = b.t - a.t
    const k = span > 0 ? (t - a.t) / span : 0
    return {
      pos: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k },
      yaw: wrapAngle(a.yaw + wrapAngle(b.yaw - a.yaw) * k),
    }
  }

  /** Index i with s[i].t <= t < s[i+1].t (t within the run). */
  private bracket(t: number): number {
    const s = this.samples
    const c = this.cursor
    if (s[c].t <= t && (c + 1 >= s.length || t < s[c + 1].t)) return c
    if (c + 2 < s.length && s[c + 1].t <= t && t < s[c + 2].t) return (this.cursor = c + 1)
    let lo = 0
    let hi = s.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (s[mid].t <= t) lo = mid
      else hi = mid
    }
    return (this.cursor = lo)
  }
}

/** JSON with object keys sorted at every level, so equal configs serialise identically. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`
}

/**
 * 53-bit string hash (cyrb53) as hex. Used to fingerprint the handling config a
 * ghost was recorded with; not cryptographic, only needs to change when the config does.
 */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

/** Fingerprint of a handling config (stable JSON → hash). */
export const handlingHash = (cfg: object): string => hashString(stableStringify(cfg))

/** The parts of a road a ghost lap rides on. */
interface GhostRoad {
  id: string
  points: readonly Vec3[]
  bank: readonly number[]
}

/**
 * Fingerprint of the road surface a ghost was recorded on (centreline to the
 * centimetre, heights to the millimetre, cross-slope). If the roads move, the
 * recorded lap floats above or sinks into them and must be re-recorded.
 */
export const roadHash = (edges: readonly GhostRoad[]): string =>
  hashString(edges.map((e) => `${e.id}:${e.points.map((p, i) => `${p.x.toFixed(2)},${p.y.toFixed(3)},${p.z.toFixed(2)},${e.bank[i].toFixed(4)}`).join(';')}`).join('|'))
