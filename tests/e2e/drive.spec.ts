import { expect, test, type Page } from '@playwright/test'

interface Tel {
  speed: number
  slipDeg: number
  drifting: boolean
  wheelsOnGround: number
}

const tel = (page: Page) => page.evaluate(() => (window as unknown as { __drift: { telemetry: () => Tel } }).__drift.telemetry())

async function waitFor(page: Page, pred: (t: Tel) => boolean, timeoutMs: number): Promise<Tel> {
  const end = Date.now() + timeoutMs
  let t = await tel(page)
  while (Date.now() < end) {
    t = await tel(page)
    if (pred(t)) return t
    await page.waitForTimeout(50)
  }
  return t
}

test('the FD accelerates, drifts on handbrake and straightens when released', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/?debug&catchup&quality=low&map=pad')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 })
  await page.locator('#scene').click()

  // settles on four wheels
  expect((await waitFor(page, (t) => t.wheelsOnGround === 4 && t.speed < 0.2, 15_000)).wheelsOnGround).toBe(4)

  // throttle until > 15 m/s
  await page.keyboard.down('KeyW')
  const fast = await waitFor(page, (t) => t.speed > 15, 40_000)
  expect(fast.speed).toBeGreaterThan(15)

  // handbrake + right steer starts a drift
  await page.keyboard.down('KeyD')
  await page.keyboard.down('Space')
  const drift = await waitFor(page, (t) => t.drifting, 30_000)
  expect(drift.drifting).toBe(true)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __drift: { skidCount: () => number } }).__drift.skidCount()), { timeout: 20_000 }).toBeGreaterThan(0)

  // release everything: slip settles under 5°
  await page.keyboard.up('Space')
  await page.keyboard.up('KeyD')
  await page.keyboard.up('KeyW')
  const calm = await waitFor(page, (t) => Math.abs(t.slipDeg) < 5 && !t.drifting, 60_000)
  expect(Math.abs(calm.slipDeg)).toBeLessThan(5)
  expect(errors).toEqual([])
})

test('C toggles the top-down camera and R resets the car', async ({ page }) => {
  await page.goto('/?debug&catchup&quality=low&map=pad')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 })
  await page.locator('#scene').click()
  const camY = () => page.evaluate(() => (window as unknown as { __drift: { cameraY: () => number } }).__drift.cameraY())
  await page.waitForTimeout(1500)
  const before = await camY()
  await page.keyboard.press('KeyC')
  await expect.poll(camY, { timeout: 20_000 }).toBeGreaterThan(before + 8)
  await page.keyboard.press('KeyR')
  await expect.poll(async () => (await tel(page)).wheelsOnGround, { timeout: 20_000 }).toBe(4)
})

test('the game pauses while the skip overlay is open', async ({ page }) => {
  await page.goto('/?debug&catchup&quality=low&map=pad')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 })
  await page.getByRole('button', { name: 'Skip the game' }).click()
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(2000)
  expect((await tel(page)).speed).toBeLessThan(0.5)
  await page.keyboard.up('KeyW')
})
