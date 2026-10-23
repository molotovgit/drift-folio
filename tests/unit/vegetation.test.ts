import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', () => import('three'))
vi.mock('../../src/render/loadModel', () => ({}))
vi.mock('../../src/render/toon', async () => {
  const T = await import('three')
  return { ToonMaterials: { create: () => new T.MeshBasicMaterial({ vertexColors: true }) } }
})
const THREE = await import('three')
const { VegetationModels } = await import('../../src/world/vegetationModels')
const { InstancedProps, placeMatrix } = await import('../../src/world/instancedProps')
const { GroundPaint } = await import('../../src/world/groundPaint')
const { RoadNetwork } = await import('../../src/world/roadNetwork')
const { Roadside } = await import('../../src/world/roadside')
const { RoadsideLayout } = await import('../../src/world/roadsideLayout')
const { TerrainHeights } = await import('../../src/world/terrain')

type Builder = () => import('three').Object3D
const MODELS: [string, Builder, number, [number, number]][] = [
  // name, builder, triangle budget, height range (m)
  ['grass', () => VegetationModels.grass(), 60, [0.3, 1]],
  ['flowers', () => VegetationModels.flowers(), 200, [0.3, 0.8]],
  ['pampas', () => VegetationModels.pampas(), 200, [1.4, 2.6]],
  ['fern', () => VegetationModels.fern(), 120, [0.3, 1.2]],
  ['bush', () => VegetationModels.bush(), 150, [1, 2]],
  ['bamboo', () => VegetationModels.bamboo(), 600, [6, 10]],
  ['jizo', () => VegetationModels.jizo(), 200, [0.8, 1.1]],
]

describe('procedural vegetation models', () => {
  for (const [name, build, budget, [hMin, hMax]] of MODELS) {
    it(`${name}: one vertex-coloured mesh, low-poly, standing on the ground`, () => {
      const root = build()
      const meshes: import('three').Mesh[] = []
      root.traverse((o) => (o as import('three').Mesh).isMesh && meshes.push(o as import('three').Mesh))
      expect(meshes.length).toBe(1) // one instanced draw per kind
      const g = meshes[0].geometry
      expect(g.getAttribute('color')).toBeTruthy()
      expect(g.getAttribute('normal')).toBeTruthy()
      expect(g.index!.count / 3).toBeLessThanOrEqual(budget)
      const box = new THREE.Box3().setFromObject(root)
      expect(box.min.y).toBeGreaterThan(-0.2)
      expect(box.min.y).toBeLessThan(0.1)
      expect(box.max.y).toBeGreaterThan(hMin)
      expect(box.max.y).toBeLessThan(hMax)
    })
  }

  it('builds identical geometry every time (seeded)', () => {
    const a = (VegetationModels.pampas().children[0] as import('three').Mesh).geometry.getAttribute('position').array
    const b = (VegetationModels.pampas().children[0] as import('three').Mesh).geometry.getAttribute('position').array
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})

describe('instanced props: cull distance and tints', () => {
  const cam = new THREE.PerspectiveCamera(60, 1.6)
  cam.position.set(0, 2, 0)
  cam.lookAt(0, 2, 10)
  cam.updateMatrixWorld()

  it('drops instances beyond the per-set cull distance', () => {
    const t = [placeMatrix(0, 0, 50), placeMatrix(0, 0, 100), placeMatrix(0, 0, 200)]
    const near = InstancedProps.fromTemplate(VegetationModels.grass(), t, { cullDistance: 110 })
    near.update(cam)
    expect(near.drawCount).toBe(2)
    const far = InstancedProps.fromTemplate(VegetationModels.grass(), t)
    far.update(cam)
    expect(far.drawCount).toBe(3)
  })

  it('packs each visible instance’s tint alongside its matrix', () => {
    const red = new THREE.Color('#ff0000')
    const blue = new THREE.Color('#0000ff')
    // the first instance is behind the camera and far: culled, so the second packs to slot 0
    const p = InstancedProps.fromTemplate(VegetationModels.bush(), [placeMatrix(0, 0, -100), placeMatrix(0, 0, 60)], { colors: [red, blue], shadows: false, receiveShadow: true })
    p.update(cam)
    expect(p.drawCount).toBe(1)
    const mesh = p.group.children[0] as import('three').InstancedMesh
    expect(mesh.castShadow).toBe(false)
    expect(mesh.receiveShadow).toBe(true)
    const c = new THREE.Color()
    mesh.getColorAt(0, c)
    expect(c.getHex()).toBe(blue.getHex())
  })
})

describe('ground paint', () => {
  const roads = new RoadNetwork()
  const p = roads.edge('summit').points[20]
  const c = new THREE.Color()

  it('paints a dirt shoulder beside the road that fades into the hillside', () => {
    const paint = new GroundPaint(roads)
    const bare = new GroundPaint()
    const near = paint.colorAt(p.x + 5, p.z, 0, c.clone()).getHex()
    expect(near).not.toBe(bare.colorAt(p.x + 5, p.z, 0, c.clone()).getHex())
    expect(paint.colorAt(p.x + 30, p.z, 0, c.clone()).getHex()).toBe(bare.colorAt(p.x + 30, p.z, 0, c.clone()).getHex())
  })

  it('darkens the ground under a canopy, most at the trunk', () => {
    const paint = new GroundPaint(null, [{ x: 100, z: 100, r: 5 }])
    expect(paint.shadeAt(100, 100)).toBe(1)
    expect(paint.shadeAt(103, 100)).toBeGreaterThan(0)
    expect(paint.shadeAt(103, 100)).toBeLessThan(1)
    expect(paint.shadeAt(106, 100)).toBe(0)
    const lum = (col: import('three').Color) => col.r + col.g + col.b
    expect(lum(paint.colorAt(100, 100, 0, c.clone()))).toBeLessThan(lum(new GroundPaint().colorAt(100, 100, 0, c.clone())))
  })
})

describe('roadside: quality tier at runtime', () => {
  const roads = new RoadNetwork()
  const layout = new RoadsideLayout(roads, new TerrainHeights(roads))
  // a camera on the summit road, looking along it
  const a = roads.edge('summit').points[40]
  const b = roads.edge('summit').points[48]
  const cam = new THREE.PerspectiveCamera(65, 1.8)
  cam.position.set(a.x, a.y + 2, a.z)
  cam.lookAt(b.x, b.y + 2, b.z)
  cam.updateMatrixWorld()
  const drawn = (r: import('../../src/world/roadside').Roadside) => r.sets.reduce((n, s) => (s.update(cam), n + s.drawCount), 0)

  it('drops to fewer plants when the governor lowers the tier, without a rebuild', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) // the glTF rock cannot load here
    const r = await Roadside.build(layout, 'high')
    const high = drawn(r)
    r.setTier('mid')
    const mid = drawn(r)
    r.setTier('low')
    const low = drawn(r)
    expect(mid).toBeLessThan(high)
    expect(low).toBeLessThan(mid)
    // the same as building for the low tier in the first place
    expect(drawn(await Roadside.build(layout, 'low'))).toBe(low)
    // a phone starting on mid builds only mid's plants and can still drop to low
    const fromMid = await Roadside.build(layout, 'mid')
    expect(drawn(fromMid)).toBe(mid)
    expect(fromMid.sets.reduce((n, s) => n + s.instanceCount, 0)).toBe(layout.forTier('mid').filter((it) => it.kind !== 'rock').length)
    fromMid.setTier('low')
    expect(drawn(fromMid)).toBe(low)
    r.setTier('high')
    expect(drawn(r)).toBe(high)
    warn.mockRestore()
  })
})
