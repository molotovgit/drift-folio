import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it, vi } from 'vitest'

/** the geometry parts RoadMesh merges into its one mesh, in order: ribbons (per edge), aprons (per node), fillets */
const drawn = vi.hoisted(() => ({ parts: [] as import('three').BufferGeometry[] }))

vi.mock('three/webgpu', () => import('three'))
vi.mock('three/addons/utils/BufferGeometryUtils.js', async (importOriginal) => {
  const utils = await importOriginal<typeof import('three/addons/utils/BufferGeometryUtils.js')>()
  return {
    ...utils,
    mergeGeometries: (parts: import('three').BufferGeometry[]) => {
      drawn.parts = parts
      return utils.mergeGeometries(parts)
    },
  }
})
// no WebGPU node materials or DOM canvas in Node: a plain material and a stub canvas
vi.mock('../../src/render/toon', async () => {
  const THREE = await import('three')
  return { ToonMaterials: { create: () => new THREE.MeshBasicMaterial() } }
})
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect: () => {} }) }) })

const THREE = await import('three')
const { JUNCTION_LIFT, RoadMesh } = await import('../../src/world/roadMesh')
const { RoadNetwork } = await import('../../src/world/roadNetwork')

const roads = new RoadNetwork()

beforeAll(async () => {
  await RAPIER.init()
  new RoadMesh(roads, new RAPIER.World({ x: 0, y: -9.81, z: 0 }))
})

/** Drawn height of one part straight under (x, z), or null where it does not cover that point. */
function heightOf(mesh: InstanceType<typeof THREE.Mesh>, x: number, y: number, z: number): number | null {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, y + 5, z), new THREE.Vector3(0, -1, 0), 0, 10)
  const hit = ray.intersectObject(mesh)[0]
  return hit ? hit.point.y : null
}

describe('road ribbons at junctions', () => {
  it('roads sharing a node get distinct ranks there, so their overlaps are never coplanar', () => {
    const ranks = RoadMesh.junctionRanks(roads)
    for (const n of roads.nodes) {
      const here = roads.edges.flatMap((e) => [...(e.from === n.id ? [ranks.get(e.id)!.from] : []), ...(e.to === n.id ? [ranks.get(e.id)!.to] : [])])
      expect(new Set(here).size, n.id).toBe(here.length)
    }
  })

  it('away from the junctions the drawn ribbon is the true surface (colliders and mesh agree)', () => {
    const e = roads.edge('automation')
    const mesh = new THREE.Mesh(drawn.parts[roads.edges.indexOf(e)], new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    const mid = Math.floor(e.points.length / 2)
    const p = e.points[mid]
    expect(heightOf(mesh, p.x, p.y, p.z)).toBeCloseTo(e.surfaceNear(mid, p.x, p.z), 3)
  })

  it('at every node, overlapping ribbons are drawn at least a lift apart, fillets strictly between apron and ribbons', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    const meshes = drawn.parts.map((g) => new THREE.Mesh(g, material))
    const fillets = meshes.slice(roads.edges.length + roads.nodes.length)
    const bad: string[] = []
    let overlaps = 0
    let filletHits = 0
    roads.nodes.forEach((n, k) => {
      const frame = roads.junction(n.id)
      const here = roads.edges.flatMap((e, i) => (e.from === n.id || e.to === n.id ? [{ e, mesh: meshes[i] }] : []))
      const apron = meshes[roads.edges.length + k]
      for (let dx = -14; dx <= 14; dx += 0.7) {
        for (let dz = -14; dz <= 14; dz += 0.7) {
          const x = n.pos.x + dx + 0.13
          const z = n.pos.z + dz + 0.07
          const y = frame.heightAt(x, z)
          const ribbons = here.flatMap(({ e, mesh }) => {
            const h = heightOf(mesh, x, y, z)
            return h === null ? [] : [{ id: e.id, h }]
          })
          ribbons.sort((a, b) => a.h - b.h)
          for (let i = 1; i < ribbons.length; i++) {
            overlaps++
            if (ribbons[i].h - ribbons[i - 1].h < JUNCTION_LIFT - 1e-4) bad.push(`${n.id} (${dx.toFixed(1)}, ${dz.toFixed(1)}): ${ribbons[i - 1].id} / ${ribbons[i].id} ${((ribbons[i].h - ribbons[i - 1].h) * 100).toFixed(2)} cm apart`)
          }
          const a = heightOf(apron, x, y, z)
          for (const f of fillets) {
            const h = heightOf(f, x, y, z)
            if (h === null) continue
            filletHits++
            if (a !== null && h <= a) bad.push(`${n.id} (${dx.toFixed(1)}, ${dz.toFixed(1)}): fillet not above apron`)
            if (ribbons.length && h >= ribbons[0].h) bad.push(`${n.id} (${dx.toFixed(1)}, ${dz.toFixed(1)}): fillet not under ${ribbons[0].id}`)
          }
        }
      }
    })
    expect(overlaps).toBeGreaterThan(100)
    expect(filletHits).toBeGreaterThan(100)
    expect(bad.slice(0, 8), `${bad.length} bad samples`).toEqual([])
  })
})
