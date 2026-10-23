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
  it('re-culls at most N sets per frame, round-robin, none deferred past the limit', () => {
    const sets = Array.from({ length: 10 }, (_, i) => InstancedProps.fromTemplate(template(), [placeMatrix(i * 3, 0, 30)]))
    const spies = sets.map((s) => vi.spyOn(s, 'update'))
    const scheduler = new CullScheduler(3, 4)
    const lastServed = new Array<number>(sets.length).fill(0)
    for (let frame = 1; frame <= 40; frame++) {
      // the camera moves far every frame, so every set always wants a re-cull
      scheduler.update(sets, camera(frame * 10, 0, 0))
      const served = spies.map((s) => s.mock.results.at(-1)?.value === true)
      const n = served.filter(Boolean).length
      if (frame === 1) expect(n).toBe(sets.length) // never-culled sets are served at once
      else expect(n).toBeLessThanOrEqual(3 + sets.length) // budget plus overdue sets
      served.forEach((s, i) => {
        if (s) lastServed[i] = frame
        expect(frame - lastServed[i], `set ${i} at frame ${frame}`).toBeLessThanOrEqual(4)
      })
      if (frame > 5) expect(n).toBeGreaterThanOrEqual(1)
    }
  })

  it('serves only the budget when no set is overdue', () => {
    const sets = Array.from({ length: 6 }, () => InstancedProps.fromTemplate(template(), [placeMatrix(0, 0, 30)]))
    const scheduler = new CullScheduler(2, 100)
    scheduler.update(sets, camera(0, 0, 0))
    const spies = sets.map((s) => vi.spyOn(s, 'update'))
    const servedPerFrame: number[] = []
    for (let frame = 0; frame < 6; frame++) {
      scheduler.update(sets, camera(50 + frame * 10, 0, 0))
      servedPerFrame.push(spies.filter((s) => s.mock.results.at(-1)?.value === true).length)
      spies.forEach((s) => s.mockClear())
    }
    expect(servedPerFrame).toEqual([2, 2, 2, 2, 2, 2])
  })
})
