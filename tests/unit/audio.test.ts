import { describe, expect, it } from 'vitest'
import {
  GEAR_COUNT,
  IDLE_RPM,
  REDLINE_RPM,
  engineCutoffHz,
  engineGain,
  engineRpm,
  firingHz,
  rumbleGain,
  selectGear,
  shiftRpm,
  squealGain,
  surfaceOf,
  wheelRpm,
  windRush,
} from '../../src/audio/audioMath'
import { AudioSystem, type AudioFrame, type VisibilitySource } from '../../src/audio/audioSystem'
import { SafeStorage } from '../../src/util/storage'

describe('audio math: gearbox and engine', () => {
  it('idles at 900 rpm when stopped and never passes the redline', () => {
    expect(engineRpm(0, 0)).toBe(IDLE_RPM)
    expect(engineRpm(200, 1)).toBe(REDLINE_RPM)
    expect(engineRpm(NaN, NaN)).toBe(IDLE_RPM)
  })

  it('revs with clutch slip when launching at full throttle', () => {
    expect(engineRpm(0, 1)).toBeGreaterThan(3000)
    expect(engineRpm(0, 1)).toBeLessThan(REDLINE_RPM)
  })

  it('selects gears 1..5 upward with speed and never goes back down', () => {
    let last = 1
    for (let v = 0; v <= 100; v += 0.5) {
      const g = selectGear(v, 1)
      expect(g).toBeGreaterThanOrEqual(last)
      expect(g).toBeLessThanOrEqual(GEAR_COUNT)
      last = g
    }
    expect(selectGear(0, 1)).toBe(1)
    expect(selectGear(100, 1)).toBe(GEAR_COUNT)
  })

  it('upshifts earlier on light throttle', () => {
    expect(shiftRpm(0)).toBeLessThan(shiftRpm(1))
    expect(selectGear(25, 0.2)).toBeGreaterThan(selectGear(25, 1))
  })

  it('drops revs on every upshift at full throttle', () => {
    let drops = 0
    for (let v = 1; v < 100; v += 0.1) {
      const before = engineRpm(v, 1)
      const after = engineRpm(v + 0.1, 1)
      if (selectGear(v + 0.1, 1) > selectGear(v, 1)) {
        expect(after).toBeLessThan(before - 1000)
        drops++
      }
    }
    expect(drops).toBe(GEAR_COUNT - 1)
  })

  it('maps rpm to a two-rotor firing frequency', () => {
    expect(firingHz(900)).toBeCloseTo(30)
    expect(firingHz(8500)).toBeCloseTo(283.33, 1)
    expect(wheelRpm(10, 2)).toBeLessThan(wheelRpm(10, 1))
  })

  it('engine gain and cutoff rise with load and revs, staying audible at idle', () => {
    expect(engineGain(IDLE_RPM, 0)).toBeGreaterThan(0.2)
    expect(engineGain(IDLE_RPM, 1)).toBeGreaterThan(engineGain(IDLE_RPM, 0))
    expect(engineGain(REDLINE_RPM, 1)).toBeCloseTo(1)
    expect(engineCutoffHz(6000, 1)).toBeGreaterThan(engineCutoffHz(6000, 0))
    expect(engineCutoffHz(6000, 1)).toBeGreaterThan(engineCutoffHz(2000, 1))
  })
})

describe('audio math: tyres and ambience', () => {
  it('squeal is silent below the drift threshold (12°, 8 m/s)', () => {
    expect(squealGain(11.9, 30)).toBe(0)
    expect(squealGain(40, 7.9)).toBe(0)
    expect(squealGain(12, 8)).toBeGreaterThan(0)
  })

  it('squeal grows with |slip| and speed, ignores sign, caps at 1', () => {
    expect(squealGain(-30, 20)).toBe(squealGain(30, 20))
    expect(squealGain(30, 20)).toBeGreaterThan(squealGain(15, 20))
    expect(squealGain(30, 25)).toBeGreaterThan(squealGain(30, 10))
    expect(squealGain(90, 80)).toBeCloseTo(1)
  })

  it('rumble only on terrain, scaled by speed and wheels down', () => {
    expect(rumbleGain(20, 'road', 4)).toBe(0)
    expect(rumbleGain(20, null, 0)).toBe(0)
    expect(rumbleGain(20, 'terrain', 4)).toBeCloseTo(1)
    expect(rumbleGain(20, 'terrain', 2)).toBeCloseTo(0.5)
    expect(rumbleGain(0, 'terrain', 4)).toBe(0)
  })

  it('wind rush rises with speed', () => {
    expect(windRush(0)).toBe(0)
    expect(windRush(60)).toBe(1)
  })

  it('derives the surface from telemetry', () => {
    expect(surfaceOf({ wheelsOnGround: 0, onRoad: true })).toBeNull()
    expect(surfaceOf({ wheelsOnGround: 3, onRoad: true })).toBe('road')
    expect(surfaceOf({ wheelsOnGround: 2, onRoad: false })).toBe('terrain')
  })
})

/**
 * Minimal AudioContext stand-in: every create* returns a node whose unknown
 * properties are AudioParam-like stubs, so the real graph code can run in node.
 */
function fakeContext() {
  const param = () => ({
    value: 0,
    setTargetAtTime: () => undefined,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  })
  const node = (): Record<string | symbol, unknown> =>
    new Proxy<Record<string | symbol, unknown>>(
      { connect: (n: unknown) => n, disconnect: () => undefined, start: () => undefined, stop: () => undefined },
      { get: (t, k) => (k in t ? t[k] : (t[k] = param())) },
    )
  const ctx = {
    state: 'suspended' as AudioContextState,
    currentTime: 0,
    sampleRate: 8000,
    destination: node(),
    resume: async () => { ctx.state = 'running' },
    suspend: async () => { ctx.state = 'suspended' },
    close: async () => { ctx.state = 'closed' },
    createBuffer: (_ch: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
  }
  return new Proxy(ctx, {
    get: (t, k) => (k in t ? t[k as keyof typeof t] : typeof k === 'string' && k.startsWith('create') ? node : undefined),
  }) as unknown as AudioContext & { state: AudioContextState }
}

const frame: AudioFrame = {
  speed: 20, throttle: 1, slipDeg: 30, drifting: true, wheelsOnGround: 4, surface: 'road', horn: true, zone: 'tunnel',
}

function makeSystem(storage = new SafeStorage('t:', null), visibility: VisibilitySource | null = null) {
  const contexts: AudioContext[] = []
  const system = new AudioSystem({
    storage,
    visibility,
    createContext: () => {
      const c = fakeContext()
      contexts.push(c)
      return c
    },
  })
  return { system, contexts }
}

describe('AudioSystem', () => {
  it('creates no AudioContext until unlock(), then exactly one', () => {
    const { system, contexts } = makeSystem()
    system.update(frame)
    system.event({ type: 'bank', value: 100 })
    system.toggleMute()
    expect(contexts).toHaveLength(0)
    expect(system.unlocked).toBe(false)

    system.unlock()
    system.unlock()
    expect(contexts).toHaveLength(1)
    expect(system.unlocked).toBe(true)
    // the built graph accepts frames for every zone and all one-shots
    for (const zone of ['mountain', 'tunnel', 'town'] as const) system.update({ ...frame, zone })
    system.setMuted(false)
    for (const type of ['start', 'multiplier', 'bank', 'crash'] as const) system.event({ type, value: 2 })
    system.event({ type: 'reset' })
  })

  it('stays silent and never retries when Web Audio is missing', () => {
    let calls = 0
    const system = new AudioSystem({
      storage: new SafeStorage('t:', null),
      visibility: null,
      createContext: () => {
        calls++
        throw new Error('no Web Audio')
      },
    })
    system.unlock()
    system.unlock()
    expect(calls).toBe(1)
    expect(system.unlocked).toBe(false)
  })

  it('persists mute via SafeStorage (memory-only backend)', () => {
    const storage = new SafeStorage('t:', null)
    const first = makeSystem(storage).system
    expect(first.muted).toBe(false)
    expect(first.toggleMute()).toBe(true)
    expect(storage.get('muted', false)).toBe(true)
    expect(makeSystem(storage).system.muted).toBe(true)
    first.setMuted(false)
    expect(makeSystem(storage).system.muted).toBe(false)
  })

  it('suspends while the tab is hidden and resumes when visible', async () => {
    let listener: (() => void) | null = null
    const vis = {
      hidden: false,
      addEventListener: (_t: 'visibilitychange', l: () => void) => { listener = l },
      removeEventListener: () => { listener = null },
    }
    const { system, contexts } = makeSystem(undefined, vis)
    system.unlock()
    await Promise.resolve()
    expect(contexts[0].state).toBe('running')
    vis.hidden = true
    listener!()
    await Promise.resolve()
    expect(contexts[0].state).toBe('suspended')
    vis.hidden = false
    listener!()
    await Promise.resolve()
    expect(contexts[0].state).toBe('running')
    system.dispose()
    expect(listener).toBeNull()
  })
})
