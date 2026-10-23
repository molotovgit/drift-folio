import { devices, expect, test } from '@playwright/test'
import { LINK_PADS } from '../../src/world/townLayout'

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
  // Pixel 7 emulation without its defaultBrowserType (that would force a new worker)
  const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7']
  void _browser
  test.use({ ...pixel, viewport: { width: 915, height: 412 } })

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

  test('a town link pad shows a tappable OPEN link on a phone', async ({ page }) => {
    test.setTimeout(240_000)
    await page.goto('/?debug&quality=low')
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 150_000 })
    const open = page.locator('.touch__open')
    await expect(open).toBeHidden()
    await page.evaluate(([x, z]) => (window as unknown as { __drift: { teleportTo: (x: number, z: number) => void } }).__drift.teleportTo(x, z), [LINK_PADS.x, LINK_PADS.z0])
    await expect(open).toBeVisible({ timeout: 60_000 })
    await expect(open).toHaveAttribute('href', 'https://github.com/molotovgit')
    await expect(open).toHaveAttribute('target', '_blank')
    await expect(page.locator('.hud__hint')).toContainText('Tap OPEN for GitHub', { timeout: 30_000 })
  })
})
