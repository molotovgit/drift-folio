import { describe, expect, it } from 'vitest'
import recorded from '../../public/ghost/systems.json'
import meta from '../../public/ghost/systems.meta.json'
import { decodeGhost, handlingHash, roadHash } from '../../src/game/ghost'
import { carConfig } from '../../src/vehicle/carConfig'
import { RoadNetwork } from '../../src/world/roadNetwork'

const RERECORD = 'Re-record it: npx vite-node scripts/record-ghost.ts — then commit public/ghost/systems.json and systems.meta.json.'

/**
 * CI guards (plan 7.7): the ghost was driven with a specific handling config
 * on a specific road surface. If either changes, the recorded lap no longer
 * matches what the car can do or where the road is, so it must be re-recorded.
 */
describe('ghost handling freeze', () => {
  it('carConfig matches the config the Systems Drop ghost was recorded with', () => {
    const now = handlingHash(carConfig)
    expect(now, `carConfig changed since the ghost was recorded (hash ${meta.handlingHash} → ${now}). ${RERECORD}`).toBe(meta.handlingHash)
  })
})

describe('ghost road freeze', () => {
  const roads = new RoadNetwork()

  it('the Systems Drop roads match the surface the ghost was recorded on', () => {
    const now = roadHash(meta.edges.map((id) => roads.edge(id)))
    expect(now, `the roads moved since the ghost was recorded (hash ${meta.roadHash} → ${now}). ${RERECORD}`).toBe(meta.roadHash)
  })

  it('every ghost pose rides at chassis height over the road (never sunk into it or floating)', () => {
    const ghost = decodeGhost(JSON.stringify(recorded))
    const bad: string[] = []
    let checked = 0
    for (const s of ghost.samples) {
      const hit = roads.index.nearest(s.x, s.z, 6)
      if (!hit) continue
      checked++
      const above = s.y - hit.edge.surfaceNear(hit.index, s.x, s.z, hit.edge.width / 2)
      if (Math.abs(above - carConfig.comHeight) > 0.3) bad.push(`t=${s.t.toFixed(1)} s: ${above.toFixed(2)} m above ${hit.edge.id}`)
    }
    // a lap that wandered away from the roads would dodge the height check: nearly every pose must be over one
    expect(checked, `only ${checked} of ${ghost.samples.length} poses are within 6 m of a road. ${RERECORD}`).toBeGreaterThanOrEqual(0.9 * ghost.samples.length)
    expect(bad.slice(0, 5), `${bad.length} poses off the road surface. ${RERECORD}`).toEqual([])
  })
})
