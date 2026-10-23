import { describe, expect, it } from 'vitest'
import { createApexTriggers, createZoneTriggers } from '../../src/game/triggers'

const at = (x: number, z: number, drifting = false, y = 0) => ({ pos: { x, y, z }, drifting })

describe('apex triggers', () => {
  const defs = [{ id: 'C4' as const, pos: { x: 0, y: 0, z: 0 }, radius: 6 }]

  it('passing within radius while drifting opens the card once per pass', () => {
    const t = createApexTriggers(defs)
    expect(t.update(at(-20, 0, true))).toEqual({})
    expect(t.update(at(-5, 0, true))).toEqual({ opened: 'C4' })
    expect(t.update(at(0, 0, true))).toEqual({})
    expect(t.update(at(5, 0, true))).toEqual({})
  })

  it('passing straight shows a hint once per pass', () => {
    const t = createApexTriggers(defs)
    expect(t.update(at(-5, 0))).toEqual({ hinted: 'C4' })
    expect(t.update(at(0, 0))).toEqual({})
  })

  it('starting to drift mid-corner after a hint still opens', () => {
    const t = createApexTriggers(defs)
    expect(t.update(at(-5, 0))).toEqual({ hinted: 'C4' })
    expect(t.update(at(0, 0, true))).toEqual({ opened: 'C4' })
    expect(t.update(at(2, 0, false))).toEqual({})
  })

  it('does not re-fire until the car is beyond radius + 5 m', () => {
    const t = createApexTriggers(defs)
    t.update(at(0, 0, true))
    expect(t.update(at(10, 0, true))).toEqual({}) // 10 < 6 + 5: still the same pass
    expect(t.update(at(0, 0, true))).toEqual({})
    t.update(at(12, 0, true)) // 12 > 11: re-armed
    expect(t.update(at(0, 0, true))).toEqual({ opened: 'C4' })
  })

  it('uses horizontal distance (height ignored)', () => {
    const t = createApexTriggers(defs)
    expect(t.update(at(0, 0, true, 40))).toEqual({ opened: 'C4' })
  })

  it('handles several corners independently', () => {
    const t = createApexTriggers([...defs, { id: 'C5', pos: { x: 100, y: 0, z: 0 }, radius: 6 }])
    expect(t.update(at(0, 0, true))).toEqual({ opened: 'C4' })
    expect(t.update(at(100, 0))).toEqual({ hinted: 'C5' })
  })
})

describe('zone triggers', () => {
  const zones = createZoneTriggers([
    { name: 'town', box: { min: { x: 0, y: -200, z: 0 }, max: { x: 10, y: 0, z: 10 } } },
    { name: 'S2', circle: { center: { x: 50, y: 0, z: 0 }, radius: 5 } },
    { name: 'S2', circle: { center: { x: 60, y: 0, z: 0 }, radius: 5 } },
  ])

  it('reports entering and leaving, once each', () => {
    expect(zones.update({ x: -5, y: -50, z: 5 })).toEqual({ entered: [], left: [] })
    expect(zones.update({ x: 5, y: -50, z: 5 })).toEqual({ entered: ['town'], left: [] })
    expect(zones.inside('town')).toBe(true)
    expect(zones.update({ x: 6, y: -50, z: 5 })).toEqual({ entered: [], left: [] })
    expect(zones.update({ x: 5, y: 5, z: 5 })).toEqual({ entered: [], left: ['town'] }) // above the box
    expect(zones.inside('town')).toBe(false)
  })

  it('treats same-named defs as one zone (union)', () => {
    expect(zones.update({ x: 50, y: 30, z: 0 }).entered).toEqual(['S2']) // circle ignores height
    expect(zones.update({ x: 55, y: 0, z: 0 })).toEqual({ entered: [], left: [] })
    expect(zones.update({ x: 60, y: 0, z: 0 })).toEqual({ entered: [], left: [] })
    expect(zones.update({ x: 70, y: 0, z: 0 }).left).toEqual(['S2'])
  })

  it('reports simultaneous transitions', () => {
    const z = createZoneTriggers([
      { name: 'a', box: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } },
      { name: 'b', circle: { center: { x: 0, y: 0, z: 0 }, radius: 2 } },
    ])
    expect(z.update({ x: 0.5, y: 0.5, z: 0.5 })).toEqual({ entered: ['a', 'b'], left: [] })
    expect(z.update({ x: 9, y: 0, z: 9 })).toEqual({ entered: [], left: ['a', 'b'] })
  })
})
