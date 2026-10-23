import type { Engine } from '../core/engine'
import type { ChaseCamera } from '../camera/chaseCamera'
import type { SkidMarks } from '../fx/skids'
import type { SmokeSystem } from '../fx/smoke'
import type { LightPool } from '../render/lightPool'
import type { PostPipeline } from '../render/post'
import type { CardPanel } from '../ui/card'
import type { CarVisual } from '../vehicle/carVisual'
import type { DriftCar } from '../vehicle/driftCar'
import type { MountainWorld } from '../world/mountainWorld'
import type { AudioSystem } from '../audio/audioSystem'
import type { MountainFeatures } from './mountainFeatures'
import type { DriftSession } from './session'

/** The game parts the test hooks read from. */
export interface DebugParts {
  engine: Engine
  car: DriftCar
  camera: ChaseCamera
  visual: () => CarVisual
  skids: SkidMarks
  smoke: SmokeSystem
  lamps: LightPool
  post: PostPipeline
  session: DriftSession
  cards: CardPanel
  audio: AudioSystem
  mountain: MountainWorld | null
  features: MountainFeatures | null
  /** hard rail/train hits since load */
  crashCount: () => number
}

/**
 * `window.__drift`: read-only telemetry and a few test helpers (teleports,
 * opening cards). Installed only with `?debug`; Playwright tests and the
 * screenshot specs use it.
 */
export class DebugHooks {
  static install(p: DebugParts): void {
    const { camera: cam, renderer } = p.engine
    /** put the car on road sample `index` of `edgeId`, facing along the road */
    const toEdge = (edgeId: string, index: number) => {
      const e = p.mountain?.roads.edge(edgeId)
      if (!e) return false
      const i = Math.max(0, Math.min(e.points.length - 1, Math.round(index)))
      const t = e.tangent(i)
      p.car.resetTo(e.points[i], Math.atan2(t.x, t.y))
      p.camera.snap()
      return true
    }
    ;(window as unknown as { __drift: unknown }).__drift = {
      telemetry: () => p.car.telemetry(),
      wheels: () => p.car.wheels(),
      cameraY: () => cam.position.y - p.car.telemetry().pos.y,
      skidCount: () => p.skids.buffer.count,
      smokeLive: () => p.smoke.live,
      activeLamps: () => p.lamps.active.length,
      quality: () => p.post.tier,
      speedFx: (s: number) => p.post.effectAt(s),
      carModel: () => p.visual().root.getObjectByName('body') !== undefined,
      renderInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
      drawnInstances: () => p.mountain?.drawnInstances ?? 0,
      teleport: (edgeId: string, frac: number) => {
        const e = p.mountain?.roads.edge(edgeId)
        return e ? toEdge(edgeId, (e.points.length - 1) * frac) : false
      },
      teleportIndex: toEdge,
      teleportTo: (x: number, z: number, yaw = 0) => {
        const y = p.mountain ? p.mountain.heightAt(x, z) + 0.15 : 0
        p.car.resetTo({ x, y, z }, yaw)
        p.camera.snap()
      },
      hairpinFrac: (edgeId: string) => {
        const e = p.mountain?.roads.edge(edgeId)
        const i = e?.hairpinApexes()[0]
        return e && i !== undefined ? i / (e.points.length - 1) : -1
      },
      score: () => p.session.score.state(),
      route: () => p.session.route,
      openCard: () => p.cards.openId,
      showCard: (id: string) => p.cards.show(id as never),
      audioContexts: () => (p.audio.unlocked ? 1 : 0),
      padUrl: () => p.features?.currentPadUrl ?? null,
      shortcutsFound: () => p.features?.discovery.all() ?? [],
      ghostBeaten: () => p.features?.ghost.beaten ?? false,
      peakOpen: () => p.features?.shortcuts.peakOpen ?? false,
      gymkhanaBest: () => p.features?.town.gymkhana.best ?? null,
      corners: () => p.features?.corners.spots.map((s) => ({ id: s.id, edgeId: s.edgeId, index: s.index, clip: s.clip, turn: s.turn })) ?? [],
      railHits: p.crashCount,
      /** give the car `speed` m/s along its heading turned by `slipDeg` (left positive): an instant slide */
      launch: (speed: number, slipDeg = 0) => {
        const yaw = p.car.telemetry().yaw + (slipDeg * Math.PI) / 180
        p.car.body.setLinvel({ x: Math.sin(yaw) * speed, y: 0, z: Math.cos(yaw) * speed }, true)
      },
    }
  }
}
