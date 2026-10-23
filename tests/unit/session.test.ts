import { describe, expect, it, vi } from 'vitest'
import { DriftSession, formatTime, type SessionInput } from '../../src/game/session'
import { RouteRuns } from '../../src/game/routeRun'
import { SafeStorage } from '../../src/util/storage'
import { RoadNetwork } from '../../src/world/roadNetwork'
import type { Hud } from '../../src/ui/hud'
import type { Telemetry } from '../../src/vehicle/driftCar'

const roads = new RoadNetwork()

function rig() {
  const hud = { update: vi.fn(), event: vi.fn(), routeBanner: vi.fn(), hint: vi.fn(), dispose: vi.fn() } as unknown as Hud & Record<string, ReturnType<typeof vi.fn>>
  const runs = new RouteRuns(new SafeStorage('test', null))
  const session = new DriftSession(roads, hud, runs)
  return { hud, runs, session }
}

const at = (edgeId: string, frac: number, extra: Partial<Telemetry> = {}): Telemetry => {
  const e = roads.edge(edgeId)
  const p = e.points[Math.floor((e.points.length - 1) * frac)]
  return { pos: { ...p }, heading: { x: 0, y: 1 }, vel: { x: 0, y: 0, z: 0 }, speed: 20, slipDeg: 0, drifting: false, wheelsOnGround: 4, onRoad: true, yaw: 0, throttle: 1, ...extra }
}

/** One frame of input; `dt` defaults to 1/60 s. */
const frame = (t: Telemetry, extra: Partial<SessionInput> = {}): SessionInput => ({ t, dt: 1 / 60, railHit: false, inShortcutZone: false, ...extra })
/** Drive `seconds` of 1/30 s frames at `t`. */
function hold(session: DriftSession, t: Telemetry, seconds: number, extra: Partial<SessionInput> = {}): void {
  for (let i = 0; i < Math.round(seconds * 30); i++) session.update(frame(t, { dt: 1 / 30, ...extra }))
}

describe('DriftSession', () => {
  it('shows a banner when entering a themed route and times the run to town', () => {
    const { hud, session } = rig()
    session.update(frame(at('summit', 0.5)))
    session.update(frame(at('systems-a', 0.3)))
    expect(hud.routeBanner).toHaveBeenCalledWith('SYSTEMS DROP')
    hold(session, at('systems-a', 0.3), 72.4)
    session.update(frame(at('town-ps', 0.5)))
    expect(hud.hint).toHaveBeenCalledWith(expect.stringMatching(/^Systems Drop: 1:12\.4 · \d+ pts · new best$/))
  })

  it('names each region on entry (Lantern Valley, Neon Ward), once per visit, without starting a timed run', () => {
    const { hud, runs, session } = rig()
    const start = vi.spyOn(runs, 'start')
    session.update(frame(at('summit', 0.5)))
    session.update(frame(at('valley-descent', 0.5)))
    expect(hud.routeBanner).toHaveBeenLastCalledWith('LANTERN VALLEY')
    session.update(frame(at('valley-hairpin', 0.5)))
    expect(hud.routeBanner).toHaveBeenCalledTimes(1)
    session.update(frame(at('town-aw', 0.5)))
    session.update(frame(at('city-avenue', 0.5)))
    expect(hud.routeBanner).toHaveBeenLastCalledWith('NEON WARD')
    expect(start).not.toHaveBeenCalled()
  })

  it('run time counts only frames the game played: a 10 min background tab adds one clamped frame', () => {
    const { hud, session } = rig()
    session.update(frame(at('summit', 0.5)))
    session.update(frame(at('systems-a', 0.3)))
    hold(session, at('systems-a', 0.3), 30)
    session.update(frame(at('systems-a', 0.3), { dt: 600 }))
    session.update(frame(at('town-ps', 0.5)))
    expect(hud.hint).toHaveBeenCalledWith(expect.stringMatching(/^Systems Drop: 0:30\.\d · /))
  })

  it('credits the route the car really drives after Fork 1, not the first one it brushed', () => {
    const { hud, runs, session } = rig()
    session.update(frame(at('summit', 0.5)))
    session.update(frame(at('platform', 0.05)))
    session.update(frame(at('automation', 0.5)))
    session.update(frame(at('town-ap', 0.5)))
    expect(hud.hint).toHaveBeenCalledWith(expect.stringMatching(/^Automation Pass: /))
    expect(runs.best('automation')).not.toBeNull()
    expect(runs.best('platform')).toBeNull()
  })

  it('a hard rail hit crashes the running drift score', () => {
    const { hud, session } = rig()
    const drifting = at('summit', 0.5, { drifting: true, slipDeg: 30 })
    for (let i = 0; i < 30; i++) session.update(frame(drifting))
    expect(session.score.state().running).toBeGreaterThan(0)
    session.update(frame(drifting, { railHit: true }))
    expect(session.score.state().running).toBe(0)
    expect(hud.event).toHaveBeenCalledWith(expect.objectContaining({ type: 'crash' }))
  })

  it('more than 1 s off the road crashes, unless inside a shortcut zone', () => {
    const offRoad = at('summit', 0.5, { drifting: true, slipDeg: 30, onRoad: false })
    for (const zone of [false, true]) {
      const { session } = rig()
      for (let i = 0; i < 90; i++) session.update(frame(offRoad, { inShortcutZone: zone }))
      expect(session.score.state().running > 0, `zone=${zone}`).toBe(zone)
    }
  })

  it('time in the air (a jump) is not off-road', () => {
    const { session } = rig()
    const airborne = at('summit', 0.5, { drifting: true, slipDeg: 30, onRoad: false, wheelsOnGround: 0 })
    for (let i = 0; i < 90; i++) session.update(frame(airborne))
    expect(session.score.state().running).toBeGreaterThan(0)
  })

  it('formats run times as m:ss.t', () => {
    expect(formatTime(73.44)).toBe('1:13.4')
    expect(formatTime(5)).toBe('0:05.0')
  })
})
