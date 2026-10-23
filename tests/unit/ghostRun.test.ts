import { describe, expect, it } from 'vitest'
import ghostText from '../../public/ghost/systems.json?raw'
import { decodeGhost, GhostPlayer } from '../../src/game/ghost'
import { DESCENT_EDGES } from '../../src/world/roadLayout'
import { RoadNetwork } from '../../src/world/roadNetwork'

/**
 * The shipped Systems Drop ghost (written by scripts/record-ghost.ts) is a
 * plausible, complete run that stays on the mountain roads.
 */
const roads = new RoadNetwork()
const ghost = decodeGhost(ghostText)
const [firstEdge, lastEdge] = [roads.edge(DESCENT_EDGES.systems[0]), roads.edge(DESCENT_EDGES.systems.at(-1)!)]
const flatDist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z)

describe('recorded Systems Drop ghost', () => {
  it('lasts between 45 and 200 s', () => {
    const d = new GhostPlayer(ghost).duration
    expect(d).toBeGreaterThan(45)
    expect(d).toBeLessThan(200)
  })

  it('starts near the start of systems-a and ends near the end of systems-c', () => {
    expect(flatDist(ghost.samples[0], firstEdge.points[0])).toBeLessThan(15)
    expect(flatDist(ghost.samples.at(-1)!, lastEdge.points.at(-1)!)).toBeLessThan(15)
  })

  it('stays within 12 m of a road centreline the whole way', () => {
    const strays = ghost.samples.filter((s) => !roads.index.nearest(s.x, s.z, 12))
    expect(strays.map((s) => `t=${s.t.toFixed(2)} (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`)).toEqual([])
  })

  it('runs forward in time at a steady rate', () => {
    for (let i = 1; i < ghost.samples.length; i++) expect(ghost.samples[i].t).toBeGreaterThan(ghost.samples[i - 1].t)
  })
})
