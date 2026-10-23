import { test, type Page } from '@playwright/test'

// Not an assertion test: captures style-gate screenshots into test-results/shots/.
// Run with: SHOTS=1 npx playwright test shots
const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
test.skip(!env.SHOTS, 'screenshots only when SHOTS=1')

type Drift = { telemetry: () => { speed: number; drifting: boolean } }
const tel = (page: Page) => page.evaluate(() => (window as unknown as { __drift: Drift }).__drift.telemetry())

for (const tier of ['high', 'low'] as const) {
  test(`style gate shots (${tier})`, async ({ page }) => {
    test.setTimeout(240_000)
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(`/?debug&catchup&quality=${tier}`)
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60_000 })
    await page.locator('#scene').click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: `test-results/shots/${tier}-1-start.png` })
    // drive up to the first lamp pair and pass under it
    await page.keyboard.down('KeyW')
    await page.waitForFunction(() => (window as unknown as { __drift: Drift }).__drift.telemetry().speed > 12, null, { timeout: 90_000 })
    await page.keyboard.up('KeyW')
    await page.waitForTimeout(600)
    await page.screenshot({ path: `test-results/shots/${tier}-2-lamp.png` })
    await page.keyboard.down('KeyW')
    await page.waitForFunction(() => (window as unknown as { __drift: Drift }).__drift.telemetry().speed > 16, null, { timeout: 90_000 })
    await page.keyboard.down('KeyD')
    await page.keyboard.down('Space')
    await page.waitForFunction(() => (window as unknown as { __drift: Drift }).__drift.telemetry().drifting, null, { timeout: 90_000 })
    await page.keyboard.up('Space')
    await page.keyboard.up('KeyD')
    await page.waitForTimeout(500)
    await page.screenshot({ path: `test-results/shots/${tier}-3-drift.png` })
    void tel
  })
}
