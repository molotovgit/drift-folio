import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { surfaceOf } from '../vehicle/wheel'
import type { NeonSign } from './cityLayout'
import { NEON } from './neonAtlas'
import { RegionMaterials } from './regionMaterials'
import { POND, RIVER_WIDTH, valleyRiver } from './riverLayout'
import type { RoadEdge, RoadNetwork } from './roadNetwork'
import { leftOf } from './spline'

/** Pavements run from the road edge to this far out; the kerb lip is the first KERB_W of it. */
const PAVE_OUTER = 8
const KERB_W = 0.22
const KERB_H = 0.08
/** pavement (and its collider) sits this far above the road edge: under the 2 cm a tyre feels as a step */
const PAVE_LIFT = 0.01
/** pavements and the wet sheen stop this far from a street's ends (the junction aprons) */
const END_CLEAR = 14
/** the wet sheen floats this far over the asphalt (above every junction lift) */
const SHEEN_LIFT = 0.06
/** a sign lights the wet road this far round it */
const SHEEN_REACH = 22
/** water stands this far over the carved bed */
const WATER_DEPTH = 0.3

type Row = THREE.Vector3[]

/**
 * Thin surfaces laid along the regions' roads and river: Neon Ward's
 * pavements and kerbs (with 'road' colliders, so a slide onto the pavement is
 * not off-road), the wet sheen of neon on its asphalt, and Lantern Valley's
 * water. Each is one mesh.
 */
export class RegionSurfaces {
  /** Pavement rows (outer → inner offsets) on both sides of every city street, as quads between valid samples. */
  static pavements(roads: RoadNetwork): { mesh: THREE.Mesh | null; collider: { positions: Float32Array; indices: Uint32Array } } {
    const kerb = new StripWriter()
    const pave = new StripWriter()
    const solid = new StripWriter()
    const slab = new THREE.Color('#6a6280')
    const slabAlt = new THREE.Color('#625a78')
    const lip = new THREE.Color('#cfc6d8')
    for (const e of roads.edges.filter((r) => r.route === 'city')) {
      for (const side of [1, -1] as const) {
        const half = e.width / 2
        const ok = e.points.map((_, i) => RegionSurfaces.paveable(roads, e, i, side))
        for (let i = 0; i + 1 < e.points.length; i++) {
          if (!ok[i] || !ok[i + 1]) continue
          const row = (k: number, offsets: [number, number][]) => offsets.map(([off, dy]) => RegionSurfaces.at(e, k, off * side, dy))
          const tone = Math.floor(e.dist[i] / 4) % 2 ? slab : slabAlt
          // a chamfered kerb lip (a vertical face would only show from one side)
          kerb.quadStrip(row(i, [[half, PAVE_LIFT], [half + KERB_W, PAVE_LIFT + KERB_H]]), row(i + 1, [[half, PAVE_LIFT], [half + KERB_W, PAVE_LIFT + KERB_H]]), lip)
          pave.quadStrip(row(i, [[half + KERB_W, PAVE_LIFT], [PAVE_OUTER, PAVE_LIFT]]), row(i + 1, [[half + KERB_W, PAVE_LIFT], [PAVE_OUTER, PAVE_LIFT]]), tone)
          solid.quadStrip(row(i, [[half, PAVE_LIFT], [PAVE_OUTER, PAVE_LIFT]]), row(i + 1, [[half, PAVE_LIFT], [PAVE_OUTER, PAVE_LIFT]]), tone)
        }
      }
    }
    const geo = StripWriter.merge([kerb, pave])
    const mesh = geo ? new THREE.Mesh(geo, RegionMaterials.solid) : null
    if (mesh) {
      mesh.name = 'city_pavements'
      mesh.receiveShadow = true
    }
    return { mesh, collider: solid.raw() }
  }

  /** Fixed trimesh colliders for the pavements, tagged 'road'. */
  static pavementCollider(world: RAPIER.World, roads: RoadNetwork): RAPIER.Collider | null {
    const { positions, indices } = RegionSurfaces.pavements(roads).collider
    if (!indices.length) return null
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    const collider = world.createCollider(RAPIER.ColliderDesc.trimesh(positions, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(0.9), body)
    surfaceOf.set(collider.handle, 'road')
    return collider
  }

  /** May sample i of a city street carry a pavement on `side`? Not near its ends, and nowhere over another road. */
  static paveable(roads: RoadNetwork, e: RoadEdge, i: number, side: 1 | -1): boolean {
    if (e.dist[i] < END_CLEAR || e.length - e.dist[i] < END_CLEAR) return false
    for (const off of [e.width / 2 + 0.5, PAVE_OUTER]) {
      const p = RegionSurfaces.at(e, i, off * side, 0)
      const hit = roads.index.nearest(p.x, p.z, PAVE_OUTER + 4)
      if (hit && hit.edge !== e && hit.dist < off + 0.5) return false
    }
    return true
  }

  /**
   * The wet look: a translucent film over every city street, dark violet with
   * pools of each nearby sign's neon colour, as if the asphalt mirrored them.
   */
  static wetSheen(roads: RoadNetwork, signs: readonly NeonSign[]): THREE.Mesh | null {
    const film = new StripWriter()
    const base = new THREE.Color('#231c3c')
    const tones = NEON.map((c) => new THREE.Color(c))
    const offsets = [-4, -2, 0, 2, 4]
    for (const e of roads.edges.filter((r) => r.route === 'city')) {
      const rows: { pts: Row; cols: THREE.Color[] }[] = []
      for (let i = 0; i < e.points.length; i++) {
        if (e.dist[i] < END_CLEAR / 2 || e.length - e.dist[i] < END_CLEAR / 2) {
          rows.push({ pts: [], cols: [] })
          continue
        }
        const pts = offsets.map((off) => RegionSurfaces.at(e, i, off, SHEEN_LIFT))
        const cols = pts.map((p) => {
          const c = base.clone()
          for (const s of signs) {
            const d = Math.hypot(s.x - p.x, s.z - p.z)
            if (d < SHEEN_REACH) c.lerp(tones[s.cell % tones.length], 0.55 * (1 - d / SHEEN_REACH) ** 2)
          }
          return c
        })
        rows.push({ pts, cols })
      }
      for (let i = 0; i + 1 < rows.length; i++) if (rows[i].pts.length && rows[i + 1].pts.length) film.quadStrip(rows[i].pts, rows[i + 1].pts, rows[i].cols, rows[i + 1].cols)
    }
    const geo = film.geometry()
    if (!geo) return null
    const mat = new THREE.MeshBasicNodeMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false })
    mat.polygonOffset = true
    mat.polygonOffsetFactor = -2
    mat.polygonOffsetUnits = -2
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = 'city_wet_sheen'
    mesh.renderOrder = 1
    return mesh
  }

  /** The valley's river ribbon and pond disc, standing WATER_DEPTH over their carved beds. */
  static water(): THREE.Mesh | null {
    const w = new StripWriter()
    const tone = new THREE.Color('#ffffff')
    const pts = valleyRiver().points
    const half = RIVER_WIDTH / 2 - 0.4
    const rows = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(pts.length - 1, i + 1)]
      const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1
      const l = leftOf((b.x - a.x) / tl, (b.z - a.z) / tl)
      const y = p.y + WATER_DEPTH
      return [new THREE.Vector3(p.x + l.x * half, y, p.z + l.z * half), new THREE.Vector3(p.x - l.x * half, y, p.z - l.z * half)]
    })
    for (let i = 0; i + 1 < rows.length; i++) w.quadStrip(rows[i], rows[i + 1], tone)
    // the pond: a fan of quads round its centre
    const r = POND.r - 0.6
    const y = POND.y + WATER_DEPTH
    const ring = (k: number) => new THREE.Vector3(POND.x + Math.cos((k / 24) * Math.PI * 2) * r, y, POND.z + Math.sin((k / 24) * Math.PI * 2) * r)
    const centre = new THREE.Vector3(POND.x, y, POND.z)
    for (let k = 0; k < 24; k++) w.quadStrip([centre, centre.clone()], [ring(k), ring(k + 1)], tone)
    const geo = w.geometry()
    if (!geo) return null
    const mesh = new THREE.Mesh(geo, RegionMaterials.water)
    mesh.name = 'valley_water'
    mesh.receiveShadow = true
    return mesh
  }

  /** Point `off` metres left of sample i (cross-slope continued past the edge), `dy` above the surface there. */
  private static at(e: RoadEdge, i: number, off: number, dy: number): THREE.Vector3 {
    const p = e.points[i]
    const t = e.tangent(i)
    const l = leftOf(t.x, t.y)
    return new THREE.Vector3(p.x + l.x * off, p.y + e.bank[i] * off + dy, p.z + l.z * off)
  }
}

/**
 * Accumulates strips of quads between pairs of rows, with vertex colours and
 * normals facing up (the winding of each quad is chosen so its normal points
 * up, whichever way the rows run).
 */
class StripWriter {
  private readonly positions: number[] = []
  private readonly colors: number[] = []
  private readonly indices: number[] = []

  /** Quads between row a and row b (same length), coloured `ca`/`cb` per vertex or one colour. */
  quadStrip(a: Row, b: Row, ca: THREE.Color | THREE.Color[], cb: THREE.Color | THREE.Color[] = ca): void {
    const base = this.positions.length / 3
    const colour = (c: THREE.Color | THREE.Color[], k: number) => (Array.isArray(c) ? c[k] : c)
    a.forEach((p, k) => this.push(p, colour(ca, k)))
    b.forEach((p, k) => this.push(p, colour(cb, k)))
    const n = a.length
    for (let k = 0; k + 1 < n; k++) {
      const [i0, i1, j0, j1] = [base + k, base + k + 1, base + n + k, base + n + k + 1]
      // normal of (i0, i1, j0): flip the winding if it points down
      const ux = a[k + 1].x - a[k].x
      const uz = a[k + 1].z - a[k].z
      const vx = b[k].x - a[k].x
      const vz = b[k].z - a[k].z
      const up = uz * vx - ux * vz > 0
      this.indices.push(...(up ? [i0, i1, j0, i1, j1, j0] : [i0, j0, i1, i1, j0, j1]))
    }
  }

  private push(p: THREE.Vector3, c: THREE.Color): void {
    this.positions.push(p.x, p.y, p.z)
    this.colors.push(c.r, c.g, c.b)
  }

  raw(): { positions: Float32Array; indices: Uint32Array } {
    return { positions: Float32Array.from(this.positions), indices: Uint32Array.from(this.indices) }
  }

  geometry(): THREE.BufferGeometry | null {
    if (!this.indices.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3))
    g.setIndex(this.indices)
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }

  /** Several writers as one geometry. */
  static merge(writers: StripWriter[]): THREE.BufferGeometry | null {
    const all = new StripWriter()
    for (const w of writers) {
      const base = all.positions.length / 3
      all.positions.push(...w.positions)
      all.colors.push(...w.colors)
      all.indices.push(...w.indices.map((i) => i + base))
    }
    return all.geometry()
  }
}

