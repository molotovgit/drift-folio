import { expect, test, type Page } from '@playwright/test'

type Debug = { telemetry: () => { speed: number; drifting: boolean }; score: () => { running: number; banked: number } }
const dbg = <T>(page: Page, fn: (d: Debug) => T) => page.evaluate(fn as never) as Promise<T>

test('drifting shows the Most Wanted counter, then banks it (M4)', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/?debug&catchup&quality=low&map=pad')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60_000 })
  await page.locator('#scene').click()

  // speed readout is live
  await page.keyboard.down('KeyW')
  await expect.poll(() => page.locator('.hud__speed-num').textContent(), { timeout: 60_000 }).not.toBe('0')
  await page.waitForFunction(() => (window as unknown as { __drift: Debug }).__drift.telemetry().speed > 16, null, { timeout: 60_000 })

  // drift axis held (L, + right steer): running score appears in the HUD. The angle
  // only lasts while the drift axis is held, so keep it down until the score is live.
  await page.keyboard.down('KeyD')
  await page.keyboard.down('KeyL')
  await page.waitForFunction(() => (window as unknown as { __drift: Debug }).__drift.telemetry().drifting, null, { timeout: 60_000 })
  await expect(page.locator('.hud__score.is-live')).toBeVisible({ timeout: 30_000 })
  await expect.poll(async () => Number((await page.locator('.hud__running').textContent())?.replace(/\D/g, '') || 0), { timeout: 30_000 }).toBeGreaterThan(0)

  // straighten out (release the drift axis): after 2 s without drifting the run banks
  await page.keyboard.up('KeyL')
  await page.keyboard.up('KeyD')
  await page.keyboard.up('KeyW')
  await expect.poll(() => dbg(page, () => (window as unknown as { __drift: Debug }).__drift.score().banked), { timeout: 90_000 }).toBeGreaterThan(0)
  await expect(page.locator('.hud__total')).toContainText(/\d/)
})
