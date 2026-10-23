import { devices, expect, test } from '@playwright/test'

test.describe('phone, loading and audio (M9)', () => {
  test('the loading screen goes away once the mountain is ready', async ({ page }) => {
    test.setTimeout(180_000)
    await page.goto('/?debug&quality=low&map=pad')
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120_000 })
    await expect(page.locator('#loading')).toBeHidden({ timeout: 5_000 })
  })

  test('no audio context exists until the first key press', async ({ page }) => {
    test.setTimeout(180_000)
    await page.addInitScript(() => {
      const w = window as unknown as { __ctxCount: number; AudioContext: unknown }
      w.__ctxCount = 0
      const Real = (window as unknown as { AudioContext: new () => AudioContext }).AudioContext
      w.AudioContext = class extends Real {
        constructor() {
          super()
          ;(window as unknown as { __ctxCount: number }).__ctxCount++
        }
      }
    })
    await page.goto('/?debug&quality=low&map=pad')
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120_000 })
    expect(await page.evaluate(() => (window as unknown as { __ctxCount: number }).__ctxCount)).toBe(0)
    await page.locator('#scene').click()
    await page.keyboard.press('KeyW')
    await expect.poll(() => page.evaluate(() => (window as unknown as { __ctxCount: number }).__ctxCount)).toBe(1)
  })
})

test.describe('touch controls', () => {
  test.use({ ...devices['Pixel 7'], viewport: { width: 915, height: 412 } })

  test('a phone gets on-screen controls and the GAS button drives the car', async ({ page }) => {
    test.setTimeout(240_000)
    await page.goto('/?debug&catchup&quality=low&map=pad')
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 150_000 })
    const gas = page.locator('.touch__btn--gas')
    await expect(gas).toBeVisible()
    const box = (await gas.boundingBox())!
    // hold GAS with a pointer (pointer events back the touch buttons)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __drift: { telemetry: () => { speed: number } } }).__drift.telemetry().speed), { timeout: 90_000 })
      .toBeGreaterThan(5)
    await page.mouse.up()
    // the page itself never scrolls or zooms
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0])
  })
})
