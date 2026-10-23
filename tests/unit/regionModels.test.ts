import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', () => import('three'))
vi.mock('../../src/render/loadModel', () => ({}))
vi.mock('../../src/render/toon', async () => {
  const T = await import('three')
  return { ToonMaterials: { create: () => new T.MeshBasicMaterial({ vertexColors: true }) } }
})
vi.mock('../../src/world/neonAtlas', async (original) => {
  const T = await import('three')
  const actual = await original<typeof import('../../src/world/neonAtlas')>()
  // no 2D canvas in the test DOM: plain textures stand in for the painted atlases
  return { ...actual, NeonAtlas: { ready: async () => undefined, facade: () => [new T.Texture(), new T.Texture()], signs: () => new T.Texture() } }
})
const THREE = await import('three')
const { TempleModels } = await import('../../src/world/templeModels')
const { CityModels } = await import('../../src/world/cityModels')
const { BAND_CELLS, BLADE_CELLS } = await import('../../src/world/cityLayout')
const { RegionSurfaces } = await import('../../src/world/regionSurfaces')
const { RoadNetwork } = await import('../../src/world/roadNetwork')

type Mesh = import('three').Mesh
const meshesOf = (root: import('three').Object3D) => {
  const out: Mesh[] = []
  root.traverse((o) => (o as Mesh).isMesh && out.push(o as Mesh))
  return out
}
const tris = (m: Mesh) => (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3

// name, builder, meshes (instanced draws), triangle budget, height range (m)
const MODELS: [string, () => import('three').Object3D, number, number, [number, number]][] = [
  ['lantern', () => TempleModels.lantern(), 2, 200, [2, 2.6]],
  ['torii', () => TempleModels.torii(), 1, 300, [3, 3.6]],
  ['gate', () => TempleModels.gate(), 1, 600, [8.5, 10]],
  ['hall', () => TempleModels.hall(), 2, 800, [10, 13]],
  ['pagoda', () => TempleModels.pagoda(), 1, 800, [18, 24]],
  ['bridge', () => TempleModels.bridge(), 1, 800, [1.8, 2.6]],
  ['paddy', () => TempleModels.paddy(), 1, 400, [0.3, 0.8]],
  ['vending', () => CityModels.vendingMachine(), 2, 60, [1.8, 2]],
]

describe('region prop models', () => {
  for (const [name, build, meshCount, budget, [hMin, hMax]] of MODELS) {
    it(`${name}: ${meshCount} vertex-coloured mesh(es), low-poly, standing on its origin`, () => {
      const root = build()
      const meshes = meshesOf(root)
      expect(meshes).toHaveLength(meshCount)
      for (const m of meshes) {
        expect(m.geometry.getAttribute('color')).toBeTruthy()
        expect(m.geometry.getAttribute('normal')).toBeTruthy()
      }
      expect(meshes.reduce((n, m) => n + tris(m), 0)).toBeLessThanOrEqual(budget)
      const box = new THREE.Box3().setFromObject(root)
      expect(box.max.y).toBeGreaterThan(hMin)
      expect(box.max.y).toBeLessThan(hMax)
      // the paddy's origin is its water surface: its skirt reaches 3 m down
      if (name === 'paddy') expect(box.min.y).toBeCloseTo(-3.05, 2)
      else expect(Math.abs(box.min.y)).toBeLessThan(0.15)
    })
  }

  it('the crest gate leaves the road clear: nothing within 6 m of its centreline below 5 m', () => {
    const pos = meshesOf(TempleModels.gate())[0].geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 5) expect(Math.abs(pos.getX(i))).toBeGreaterThan(6)
  })

  it('builds identical geometry every time (seeded)', () => {
    const a = meshesOf(TempleModels.paddy())[0].geometry.getAttribute('position').array
    const b = meshesOf(TempleModels.paddy())[0].geometry.getAttribute('position').array
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('all valley kinds together cost at most 12 instanced draws (before outlines)', () => {
    const total = MODELS.filter(([n]) => n !== 'vending').reduce((n, [, build]) => n + meshesOf(build()).length, 0)
    // + the bamboo groves (one mesh) and the water
    expect(total + 2).toBeLessThanOrEqual(12)
  })
})

describe('Neon Ward merged meshes', () => {
  const building = (x: number, front: boolean) => ({ x, z: 0, yaw: 0.3, w: 14, d: 12, h: 30, y: -1, tint: 0.4, front })

  it('every block of the ward is one mesh, tiling the facade by real size within the texture', () => {
    const list = [building(0, true), building(40, false)]
    const mesh = CityModels.buildings(list, [new THREE.Texture(), new THREE.Texture()])!
    expect(meshesOf(mesh)).toHaveLength(1)
    const uv = mesh.geometry.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0)
      expect(uv.getY(i)).toBeLessThanOrEqual(1 + 1e-9)
    }
    // the walls reach from the sunk base to the roof
    const box = new THREE.Box3().setFromObject(mesh)
    expect(box.min.y).toBeCloseTo(-1, 3)
    expect(box.max.y).toBeGreaterThanOrEqual(-1 + 30.6 - 1e-6)
    expect(CityModels.buildings([], [new THREE.Texture(), new THREE.Texture()])).toBeNull()
  })

  it('sign cells: blades in the top half, bands in the bottom, all distinct and inside the atlas', () => {
    const rects = [
      ...Array.from({ length: BLADE_CELLS }, (_, cell) => CityModels.cellUv({ kind: 'blade', cell })),
      ...Array.from({ length: BAND_CELLS }, (_, cell) => CityModels.cellUv({ kind: 'band', cell })),
    ]
    expect(new Set(rects.map((r) => r.join())).size).toBe(rects.length)
    for (const [u0, v0, u1, v1] of rects) {
      for (const v of [u0, v0, u1, v1]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      expect(u1).toBeGreaterThan(u0)
      expect(v1).toBeGreaterThan(v0)
    }
    for (let cell = 0; cell < BLADE_CELLS; cell++) expect(CityModels.cellUv({ kind: 'blade', cell })[1]).toBeGreaterThanOrEqual(0.5)
    for (let cell = 0; cell < BAND_CELLS; cell++) expect(CityModels.cellUv({ kind: 'roof', cell })[3]).toBeLessThanOrEqual(0.5)
  })

  it('signs merge into one mesh; pavements and the valley water are one mesh each', () => {
    const sign = { kind: 'blade' as const, x: 0, y: 8, z: 0, yaw: 0, w: 1.5, h: 6, cell: 2, primary: true }
    expect(meshesOf(CityModels.signs([sign, { ...sign, kind: 'roof', x: 10, w: 8, h: 3.6 }], new THREE.Texture(), 's')!)).toHaveLength(1)
    expect(CityModels.signs([], new THREE.Texture(), 's')).toBeNull()
    const roads = new RoadNetwork()
    const { mesh, collider } = RegionSurfaces.pavements(roads)
    expect(mesh).toBeTruthy()
    expect(collider.indices.length).toBeGreaterThan(1000)
    expect(RegionSurfaces.water()).toBeTruthy()
    // built once per network
    expect(RegionSurfaces.pavements(roads)).toBe(RegionSurfaces.pavements(roads))
  })
})

describe('region props in the scene (low tier)', () => {
  it('builds the low tier without the detail meshes and draws the merged meshes only near them', async () => {
    const { RegionLayouts } = await import('../../src/world/regionLayouts')
    const { RegionProps, REGION_DRAW_DISTANCE } = await import('../../src/world/regionProps')
    const { TerrainHeights } = await import('../../src/world/terrain')
    const { TOWN_LOTS } = await import('../../src/world/townLayout')
    const { TEMPLE_LOTS } = await import('../../src/world/templeLayout')
    const { allChannels } = await import('../../src/world/shortcutLayout')
    const roads = new RoadNetwork()
    const terrain = new TerrainHeights(roads, [...TOWN_LOTS, ...TEMPLE_LOTS], allChannels(roads))
    const props = await RegionProps.build(RegionLayouts.of(roads, terrain), roads, terrain, 'low')
    const names = props.group.children.map((o) => o.name)
    expect(names).not.toContain('city_signs_small')
    expect(names).not.toContain('city_wet_sheen')
    // buildings, big signs, expressway + its lights, pavements, water
    expect(props.group.children.filter((o) => (o as Mesh).isMesh)).toHaveLength(6)
    const cam = new THREE.PerspectiveCamera(60, 1.6)
    const look = (x: number, z: number) => {
      cam.position.set(x, roads.index.nearest(x, z, 20)?.point.y ?? 0, z)
      props.update(cam)
      return props.visibleStatics
    }
    // from the summit pad (over a kilometre from the ward) only the valley's water is near enough to draw
    expect(look(0, -30)).toBe(1)
    expect(props.group.children.filter((o) => o.visible && (o as Mesh).isMesh).map((o) => o.name)).toEqual(['valley_water'])
    // from Automation Pass's upper sweepers, neither region's merged meshes
    expect(look(205, 250)).toBe(0)
    const avenue = roads.edge('city-avenue').points[200]
    // in the ward: blocks, signs, expressway, its lights and pavements (the valley's water is far away)
    expect(look(avenue.x, avenue.z)).toBe(5)
    expect(REGION_DRAW_DISTANCE).toBeLessThanOrEqual(600)
  }, 30_000)
})
