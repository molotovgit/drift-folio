import { expect, test } from '@playwright/test'
import { LINK_PADS } from '../../src/world/townLayout'

type Debug = { teleportTo: (x: number, z: number, yaw?: number) => void; padUrl: () => string | null }

test('the GitHub link pad in town opens GitHub on Enter (M6)', async ({ page, context }) => {
  test.setTimeout(240_000)
  await page.goto('/?debug&quality=low')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 150_000 })
  await page.evaluate(([x, z]) => (window as unknown as { __drift: Debug }).__drift.teleportTo(x, z), [LINK_PADS.x, LINK_PADS.z0])
  await expect.poll(() => page.evaluate(() => (window as unknown as { __drift: Debug }).__drift.padUrl()), { timeout: 60_000 }).toBe('https://github.com/molotovgit')
  await expect(page.locator('.hud__hint')).toContainText('Press Enter to open GitHub', { timeout: 30_000 })
  const popup = context.waitForEvent('page')
  await page.locator('#scene').click()
  await page.keyboard.press('Enter')
  expect((await popup).url()).toContain('github.com/molotovgit')
})
