import { test } from '@playwright/test'

// Not an assertion test: captures review screenshots into test-results/shots/.
// Run with: SHOTS=1 npx playwright test shots
const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
test.skip(!env.SHOTS, 'screenshots only when SHOTS=1')

test('review screenshots', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/?debug')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 })
  await page.locator('#scene').click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'test-results/shots/01-start.png' })
  await page.keyboard.down('KeyW')
  await page.waitForFunction(() => (window as never as { __drift: { telemetry: () => { speed: number } } }).__drift.telemetry().speed > 16, null, { timeout: 60_000 })
  await page.keyboard.down('KeyD')
  await page.keyboard.down('Space')
  await page.waitForFunction(() => (window as never as { __drift: { telemetry: () => { drifting: boolean } } }).__drift.telemetry().drifting, null, { timeout: 60_000 })
  await page.keyboard.up('Space')
  await page.keyboard.up('KeyD')
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/shots/02-drift.png' })
})
