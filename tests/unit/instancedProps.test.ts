import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', () => import('three'))
vi.mock('../../src/render/loadModel', () => ({}))
const THREE = await import('three')
const { ALWAYS_RADIUS, CullScheduler, InstancedProps, cullConeCos, placeMatrix } = await import('../../src/world/instancedProps')
const { mulberry32 } = await import('../../src/world/dressing')

type Props = import('../../src/world/instancedProps').InstancedProps

/** A one-mesh template; `offset` gives its sub-mesh a non-identity local matrix. */
function template(offset = 0): import('three').Object3D {
  const root = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  mesh.position.y = offset
  root.add(mesh)
  return root
}

/** Seeded instances scattered over a square centred on the origin (negative coordinates too). */
function scatter(n: number, half: number, seed: number): { transforms: import('three').Matrix4[]; keep: Float32Array } {
  const rnd = mulberry32(seed)
  const transforms: import('three').Matrix4[] = []
  const keep = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    transforms.push(placeMatrix((rnd() * 2 - 1) * half, rnd() * 5, (rnd() * 2 - 1) * half, rnd() * 6, 0.8 + rnd() * 0.4))
    keep[i] = rnd()
  }
  return { transforms, keep }
}

/** Positions (x, z) of the packed slots, as sorted strings. */
function packed(p: Props): string[] {
  const mesh = p.group.children[0] as import('three').InstancedMesh
  const out: string[] = []
  const m = new THREE.Matrix4()
  for (let s = 0; s < mesh.count; s++) {
    mesh.getMatrixAt(s, m)
    out.push(`${m.elements[12].toFixed(3)},${m.elements[14].toFixed(3)}`)
  }
  return out.sort()
}

/** The cull rule applied naively to every instance (float32 positions, like the set keeps). */
function bruteForce(transforms: readonly import('three').Matrix4[], keep: Float32Array, keepBelow: number, cam: import('three').PerspectiveCamera, cullDistance: number): string[] {
  const dir = cam.getWorldDirection(new THREE.Vector3())
  const hl = Math.hypot(dir.x, dir.z) || 1
  const coneCos = cullConeCos(cam)
  const out: string[] = []
  transforms.forEach((t, i) => {
    if (keep[i] >= keepBelow) return
    const dx = Math.fround(t.elements[12]) - cam.position.x
    const dz = Math.fround(t.elements[14]) - cam.position.z
    const d = Math.sqrt(dx * dx + dz * dz)
    if (d > cullDistance) return
    if (d > ALWAYS_RADIUS && dx * (dir.x / hl) + dz * (dir.z / hl) < coneCos * d) return
    // the instance buffer stores float32, like the positions
    out.push(`${Math.fround(t.elements[12]).toFixed(3)},${Math.fround(t.elements[14]).toFixed(3)}`)
  })
  return out.sort()
}

function camera(x: number, z: number, yaw: number, pitch = 0): import('three').PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(65, 1.8)
  cam.position.set(x, 3, z)
  cam.lookAt(x + Math.sin(yaw) * Math.cos(pitch), 3 + Math.sin(pitch), z + Math.cos(yaw) * Math.cos(pitch))
  cam.updateMatrixWorld()
  return cam
}

describe('instanced props: grid cull', () => {
  const { transforms, keep } = scatter(4000, 700, 11)

  for (const cullDistance of [80, 220, 380]) {
    it(`matches a brute-force cull for random camera poses (cull distance ${cullDistance} m)`, () => {
      const rnd = mulberry32(cullDistance)
      // one set re-culled from pose to pose, as in the game
      const set = InstancedProps.fromTemplate(template(), transforms, { cullDistance, keep })
      let drawn = 0
      for (let k = 0; k < 25; k++) {
        const frac = k % 3 === 0 ? 1 : 0.3 + rnd() * 0.6
        set.setThinning(frac)
        // some poses sit outside the scattered area, so the scanned cell block is clipped
        const cam = camera((rnd() * 2 - 1) * 900, (rnd() * 2 - 1) * 900, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.6)
        expect(set.update(cam)).toBe(true)
        expect(packed(set), `pose ${k}`).toEqual(bruteForce(transforms, keep, frac, cam, cullDistance))
        drawn += set.drawCount
      }
      expect(drawn).toBeGreaterThan(25)
    })
  }

  it('applies a non-identity sub-mesh matrix on top of each transform', () => {
    const set = InstancedProps.fromTemplate(template(2), [placeMatrix(0, 1, 20)])
    set.update(camera(0, 0, 0))
    const m = new THREE.Matrix4()
    ;(set.group.children[0] as import('three').InstancedMesh).getMatrixAt(0, m)
    expect(m.elements[13]).toBeCloseTo(3)
  })
})

describe('instanced props: thinning', () => {
  const { transforms, keep } = scatter(2000, 150, 5)
  const cam = camera(0, 0, 0.4)

  it('draws nested subsets as the fraction drops, and recovers when it rises', () => {
    const set = InstancedProps.fromTemplate(template(), transforms, { keep })
    const at = (frac: number) => {
      set.setThinning(frac)
      set.update(cam)
      return packed(set)
    }
    const high = at(1)
    const mid = at(0.7)
    const low = at(0.4)
    expect(mid.length).toBeLessThan(high.length)
    expect(low.length).toBeLessThan(mid.length)
    const midSet = new Set(mid)
    const highSet = new Set(high)
    for (const p of low) expect(midSet.has(p)).toBe(true)
    for (const p of mid) expect(highSet.has(p)).toBe(true)
    expect(at(1)).toEqual(high)
  })

  it('re-culls on a thinning change even when the camera has not moved', () => {
    const set = InstancedProps.fromTemplate(template(), transforms, { keep })
    set.update(cam)
    const before = set.drawCount
    set.setThinning(0.5)
    expect(set.update(cam)).toBe(true)
    expect(set.drawCount).toBeLessThan(before)
  })

  it('thins unculled sets immediately', () => {
    const set = InstancedProps.fromTemplate(template(), transforms, { keep, culled: false })
    expect(set.drawCount).toBe(transforms.length)
    set.setThinning(0.25)
    expect(set.drawCount).toBe(Array.from(keep).filter((k) => k < 0.25).length)
  })

  it('ignores (with a warning) per-instance arrays of the wrong length', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const set = InstancedProps.fromTemplate(template(), transforms, { keep: new Float32Array(3), colors: [new THREE.Color()] })
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
    set.setThinning(0.1)
    set.update(cam)
    expect(set.drawCount).toBeGreaterThan(0)
    expect((set.group.children[0] as import('three').InstancedMesh).instanceColor).toBeNull()
  })
})

describe('cull scheduler', () => {
  const makeSets = (n: number) => Array.from({ length: n }, (_, i) => InstancedProps.fromTemplate(template(), [placeMatrix(i * 3, 0, 30)]))
  /** How many sets re-culled in the scheduler's last frame. */
  const servedLastFrame = (spies: ReturnType<typeof vi.spyOn>[]) => spies.filter((s) => s.mock.results.at(-1)?.value === true).length

  it('serves never-culled sets at once, then at most the budget per frame', () => {
    const sets = makeSets(10)
    const scheduler = new CullScheduler(3, 100)
    const spies = sets.map((s) => vi.spyOn(s, 'update'))
    scheduler.update(sets, camera(0, 0, 0))
    expect(servedLastFrame(spies)).toBe(10)
    // driving at ~50 m/s and 30 fps: every set wants a re-cull every few frames, nobody is overdue
    const perFrame: number[] = []
    for (let frame = 1; frame <= 40; frame++) {
      scheduler.update(sets, camera(frame * 1.7, 0, 0))
      perFrame.push(servedLastFrame(spies))
    }
    for (const n of perFrame) expect(n).toBeLessThanOrEqual(3)
    expect(perFrame.reduce((a, b) => a + b, 0)).toBeGreaterThan(40) // the budget is used
  })

  it('serves every waiting set once it has waited the deferral limit', () => {
    const sets = makeSets(10)
    const scheduler = new CullScheduler(1, 3)
    scheduler.update(sets, camera(0, 0, 0))
    const spies = sets.map((s) => vi.spyOn(s, 'update'))
    const served = new Set<number>()
    // one small step (past the re-cull distance, short of a jump), then the camera holds still
    const cam = camera(6.5, 0, 0)
    for (let frame = 1; frame <= 4; frame++) {
      scheduler.update(sets, cam)
      const now = spies.flatMap((s, i) => (s.mock.results.at(-1)?.value === true ? [i] : []))
      if (frame < 4) expect(now.length, `frame ${frame}`).toBe(1) // budget only
      now.forEach((i) => served.add(i))
    }
    expect(served.size).toBe(10) // frame 4: the rest were overdue
  })

  it('re-culls every set the same frame after a teleport or a sharp turn', () => {
    const sets = makeSets(10)
    const scheduler = new CullScheduler(1, 100)
    scheduler.update(sets, camera(0, 0, 0))
    const spies = sets.map((s) => vi.spyOn(s, 'update'))
    scheduler.update(sets, camera(400, 300, 0)) // camera.snap() to a checkpoint
    expect(servedLastFrame(spies)).toBe(10)
    scheduler.update(sets, camera(400, 300, 0.3)) // a fast drift spin
    expect(servedLastFrame(spies)).toBe(10)
  })
})
