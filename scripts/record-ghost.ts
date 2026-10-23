/**
 * Records the Systems Drop ghost lap (plan 7.7, spec §8).
 *
 *   npx vite-node scripts/record-ghost.ts
 *
 * Builds the real mountain colliders in headless Rapier (terrain heightfield,
 * road trimeshes, guard rails), drives 'systems-a' → 'systems-c' with the
 * scripted RacingLineDriver at the fixed 60 Hz physics step, and writes:
 *   public/ghost/systems.json       encoded GhostRecording, timeline ×1.1
 *   public/ghost/systems.meta.json  handling + road hashes and run stats (CI guards)
 * A run only counts if it finishes cleanly (never off-road > 1 s, no hard rail hit).
 */
import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { idleControls, type ControlState } from '../src/core/input'
import { PHYSICS_STEP } from '../src/core/loop'
import { encodeGhost, GhostRecorder, handlingHash, roadHash, scaleGhostTime, type GhostRecording } from '../src/game/ghost'
import { RacingLineDriver, type RacingLineOptions } from '../src/game/racingLineDriver'
import { carConfig } from '../src/vehicle/carConfig'
import { DriftCar, type Telemetry } from '../src/vehicle/driftCar'
import { surfaceOf } from '../src/vehicle/wheel'
import { GuardRails } from '../src/world/guardRails'
import { LotSurface } from '../src/world/lotSurface'
import { DESCENT_EDGES } from '../src/world/roadLayout'
import { RoadNetwork } from '../src/world/roadNetwork'
import { RoadSurface } from '../src/world/roadSurface'
import { allChannels, PEAK } from '../src/world/shortcutLayout'
import { TerrainHeights } from '../src/world/terrain'
import { TerrainCollider } from '../src/world/terrainCollider'
import { TOWN_LOTS } from '../src/world/townLayout'

/** spec §8: the ghost is about 10% slower than the best scripted run */
const GHOST_SLOWDOWN = 1.1
const TIMEOUT_S = 240
/** crash rule (plan Global Constraints): off-road for more than this is a crash */
const OFF_ROAD_LIMIT_S = 1.0
/** start a few samples into systems-a so the car is clear of the fork junction */
const SPAWN_SAMPLE = 2
/** `--trace` prints the car's state once a second (for tuning the driver) */
const TRACE = process.argv.includes('--trace')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/ghost/systems.json')
const META = resolve(ROOT, 'public/ghost/systems.meta.json')

interface RunResult {
  rec: GhostRecording
  time: number
  finished: boolean
  maxOffRoad: number
  railHits: number
  clean: boolean
}

/** The mountain's static colliders, built without any rendering (no DOM in Node). */
class HeadlessMountain {
  readonly world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  readonly roads = new RoadNetwork()

  constructor() {
    this.world.timestep = PHYSICS_STEP
    // same terrain, road, lot and rail colliders (and tags) as MountainWorld / BaseTown build in the game
    const peakLot = { name: 'peak' as const, ...PEAK }
    new TerrainCollider(this.world, new TerrainHeights(this.roads, [...TOWN_LOTS, peakLot], allChannels(this.roads)))
    RoadSurface.colliders(this.roads, this.world)
    LotSurface.colliders(
      this.world,
      TOWN_LOTS.map((l) => LotSurface.of(l, this.roads)),
    )
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    for (const edge of this.roads.edges.filter((e) => e.route !== 'town')) {
      for (const run of GuardRails.findRuns(edge)) {
        const wall = GuardRails.runGeometry(run, -0.3, 1.1)
        const c = this.world.createCollider(RAPIER.ColliderDesc.trimesh(wall.positions, wall.indices).setFriction(0.25).setRestitution(0.2), body)
        surfaceOf.set(c.handle, 'rail')
      }
    }
  }
}

/** One `--trace` line: progress, speed vs plan, distance off the centreline, slip and controls. */
function trace(t: number, tel: Telemetry, c: ControlState, driver: RacingLineDriver, roads: RoadNetwork): void {
  const off = roads.index.nearest(tel.pos.x, tel.pos.z)?.dist ?? Infinity
  console.log(
    `t=${t.toFixed(1)} s=${driver.progress.toFixed(0)}/${driver.length.toFixed(0)} v=${tel.speed.toFixed(1)} plan=${driver.targetSpeed().toFixed(1)} ` +
      `off=${off.toFixed(1)} road=${tel.onRoad} slip=${tel.slipDeg.toFixed(0)} steer=${c.steer.toFixed(2)} thr=${c.throttle.toFixed(2)} brk=${c.brake.toFixed(2)} hb=${c.handbrake}`,
  )
}

/** One full scripted run with the given driver tuning. */
function drive(opts: Partial<RacingLineOptions>): RunResult {
  const m = new HeadlessMountain()
  const edges = DESCENT_EDGES.systems
  const driver = new RacingLineDriver(m.roads, edges, opts)
  const first = m.roads.edge(edges[0])
  const p = first.points[SPAWN_SAMPLE]
  const tan = first.tangent(SPAWN_SAMPLE)
  const car = new DriftCar(m.world, p, Math.atan2(tan.x, tan.y))
  const events = new RAPIER.EventQueue(true)
  const rec = new GhostRecorder()

  // settle on the suspension before the clock starts
  for (let i = 0; i < 30; i++) {
    car.update(idleControls(), PHYSICS_STEP)
    m.world.step(events)
  }
  events.clear()

  rec.start()
  let tick = 0
  let offRoad = 0
  let maxOffRoad = 0
  let railHits = 0
  // integer ticks so run time is exact (no float drift from summing 1/60)
  const time = () => tick * PHYSICS_STEP
  while (time() < TIMEOUT_S && !driver.finished()) {
    const tel = car.telemetry()
    if (tel.pos.y < -200) break // fell out of the world
    rec.sample(time(), { pos: tel.pos, yaw: tel.yaw })
    const ctrl = driver.controls(tel, PHYSICS_STEP)
    if (TRACE && tick % 30 === 0) trace(time(), tel, ctrl, driver, m.roads)
    car.update(ctrl, PHYSICS_STEP)
    m.world.step(events)
    // same rule as Game: any chassis contact-force event against a rail is a crash
    events.drainContactForceEvents((e) => {
      if (surfaceOf.get(e.collider1()) !== 'rail' && surfaceOf.get(e.collider2()) !== 'rail') return
      railHits++
      if (TRACE) console.log(`  rail hit at t=${time().toFixed(2)} s, ${driver.progress.toFixed(0)} m, ${e.totalForceMagnitude().toFixed(0)} N`)
    })
    tick++
    offRoad = car.telemetry().onRoad ? 0 : offRoad + PHYSICS_STEP
    maxOffRoad = Math.max(maxOffRoad, offRoad)
  }
  const t = time()
  const end = car.telemetry()
  rec.sample(t, { pos: end.pos, yaw: end.yaw })
  const finished = driver.finished()
  return { rec: rec.stop(), time: t, finished, maxOffRoad, railHits, clean: finished && maxOffRoad <= OFF_ROAD_LIMIT_S && railHits === 0 }
}

/** Driver variants tried; the fastest clean run becomes the ghost. */
const VARIANTS: Partial<RacingLineOptions>[] = TRACE ? [{}] : [{}, { maxSpeed: 34 }, { maxSpeed: 42 }, { gripMargin: 0.8 }, { hairpinSpeed: 10 }, { hairpinSpeed: 9 }]

async function main(): Promise<void> {
  await RAPIER.init()
  let best: RunResult | null = null
  for (const v of VARIANTS) {
    const r = drive(v)
    console.log(
      `variant ${JSON.stringify(v)}: ${r.finished ? 'finished' : 'DNF'} in ${r.time.toFixed(2)} s, ` +
        `max off-road ${r.maxOffRoad.toFixed(2)} s, rail hits ${r.railHits} → ${r.clean ? 'clean' : 'not clean'}`,
    )
    if (r.clean && (!best || r.time < best.time)) best = r
  }
  if (!best) {
    console.error('record-ghost: no clean run; tune RacingLineDriver')
    process.exit(1)
  }
  const ghost = scaleGhostTime(best.rec, GHOST_SLOWDOWN)
  const roads = new RoadNetwork()
  const text = encodeGhost(ghost)
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, text)
  const meta = {
    handlingHash: handlingHash(carConfig),
    roadHash: roadHash(DESCENT_EDGES.systems.map((id) => roads.edge(id))),
    scriptedRunS: Number(best.time.toFixed(3)),
    ghostTimeS: Number((best.time * GHOST_SLOWDOWN).toFixed(3)),
    slowdown: GHOST_SLOWDOWN,
    samples: ghost.samples.length,
    stayedOnRoad: best.maxOffRoad <= OFF_ROAD_LIMIT_S,
    maxOffRoadS: Number(best.maxOffRoad.toFixed(3)),
    edges: DESCENT_EDGES.systems,
  }
  writeFileSync(META, JSON.stringify(meta, null, 2) + '\n')
  console.log(`best scripted run ${best.time.toFixed(2)} s → ghost ${meta.ghostTimeS} s (${(text.length / 1024).toFixed(1)} KB), stayed on road: ${meta.stayedOnRoad}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
