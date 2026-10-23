import { expect, test } from '@playwright/test'

type Debug = {
  teleportTo: (x: number, z: number, yaw?: number) => void
  shortcutsFound: () => string[]
  peakOpen: () => boolean
  ghostBeaten: () => boolean
}
const d = () => (window as unknown as { __drift: Debug }).__drift

test.describe('shortcuts (M7)', () => {
  test('driving into the dry riverbed finds S2; the hidden peak starts closed', async ({ page }) => {
    test.setTimeout(240_000)
    await page.goto('/?debug&quality=low')
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 150_000 })
    expect(await page.evaluate(() => (window as unknown as { __drift: Debug }).__drift.peakOpen())).toBe(false)
    // the riverbed's midpoint (see shortcutLayout.riverbed): between (104,700) and (106,770)
    await page.evaluate(() => (window as unknown as { __drift: Debug }).__drift.teleportTo(105, 735, 0))
    await expect.poll(() => page.evaluate(() => (window as unknown as { __drift: Debug }).__drift.shortcutsFound()), { timeout: 60_000 }).toContain('S2')
    await expect(page.locator('.hud__hint')).toContainText('Shortcut found: Dry riverbed', { timeout: 30_000 })
    void d
  })
})
