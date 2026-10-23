import { describe, expect, it, vi } from 'vitest'
import { DriftSession, formatTime } from '../../src/game/session'
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

describe('DriftSession', () => {
  it('shows a banner when entering a themed route and times the run to town', () => {
    const { hud, session } = rig()
    session.update({ t: at('summit', 0.5), dt: 1 / 60, now: 0, railHit: false, inShortcutZone: false })
    session.update({ t: at('systems-a', 0.3), dt: 1 / 60, now: 1, railHit: false, inShortcutZone: false })
    expect(hud.routeBanner).toHaveBeenCalledWith('SYSTEMS DROP')
    session.update({ t: at('town-ps', 0.5), dt: 1 / 60, now: 73.4, railHit: false, inShortcutZone: false })
    expect(hud.hint).toHaveBeenCalledWith(expect.stringMatching(/^Systems Drop: 1:12\.4 · \d+ pts · new best$/))
  })

  it('a hard rail hit crashes the running drift score', () => {
    const { hud, session } = rig()
    const drifting = at('summit', 0.5, { drifting: true, slipDeg: 30 })
    for (let i = 0; i < 30; i++) session.update({ t: drifting, dt: 1 / 60, now: i / 60, railHit: false, inShortcutZone: false })
    expect(session.score.state().running).toBeGreaterThan(0)
    session.update({ t: drifting, dt: 1 / 60, now: 1, railHit: true, inShortcutZone: false })
    expect(session.score.state().running).toBe(0)
    expect(hud.event).toHaveBeenCalledWith(expect.objectContaining({ type: 'crash' }))
  })

  it('more than 1 s off the road crashes, unless inside a shortcut zone', () => {
    const offRoad = at('summit', 0.5, { drifting: true, slipDeg: 30, onRoad: false })
    for (const zone of [false, true]) {
      const { session } = rig()
      for (let i = 0; i < 90; i++) session.update({ t: offRoad, dt: 1 / 60, now: i / 60, railHit: false, inShortcutZone: zone })
      expect(session.score.state().running > 0, `zone=${zone}`).toBe(zone)
    }
  })

  it('formats run times as m:ss.t', () => {
    expect(formatTime(73.44)).toBe('1:13.4')
    expect(formatTime(5)).toBe('0:05.0')
  })
})
