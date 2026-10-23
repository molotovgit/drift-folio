import { describe, expect, it } from 'vitest'
import meta from '../../public/ghost/systems.meta.json'
import { handlingHash } from '../../src/game/ghost'
import { carConfig } from '../../src/vehicle/carConfig'

/**
 * CI guard (plan 7.7): the ghost was driven with a specific handling config.
 * If carConfig changes, the recorded lap no longer matches what the car can
 * do, so the ghost must be re-recorded.
 */
describe('ghost handling freeze', () => {
  it('carConfig matches the config the Systems Drop ghost was recorded with', () => {
    const now = handlingHash(carConfig)
    expect(
      now,
      `carConfig changed since the ghost was recorded (hash ${meta.handlingHash} → ${now}). ` +
        'Re-record it: npx vite-node scripts/record-ghost.ts — then commit public/ghost/systems.json and systems.meta.json.',
    ).toBe(meta.handlingHash)
  })
})
