import { expect, test, type Page } from '@playwright/test'

interface Tel {
  pos: { x: number; y: number; z: number }
  speed: number
  onRoad: boolean
  wheelsOnGround: number
}
type Debug = { telemetry: () => Tel; renderInfo: () => { calls: number; triangles: number } }
const tel = (page: Page) => page.evaluate(() => (window as unknown as { __drift: Debug }).__drift.telemetry())

test.describe('the mountain (M3)', () => {
  test('spawns on the road at the summit and can drive down it', async ({ page }) => {
    test.setTimeout(180_000)
    await page.goto('/?debug&catchup&quality=low')
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120_000 })
    await expect.poll(async () => (await tel(page)).wheelsOnGround, { timeout: 30_000 }).toBe(4)
    const t0 = await tel(page)
    expect(t0.onRoad).toBe(true)
    expect(Math.abs(t0.pos.x)).toBeLessThan(3)
    await page.locator('#scene').click()
    await page.keyboard.down('KeyW')
    await expect.poll(async () => (await tel(page)).pos.z, { timeout: 90_000 }).toBeGreaterThan(t0.pos.z + 60)
    await page.keyboard.up('KeyW')
    const t1 = await tel(page)
    expect(t1.onRoad).toBe(true)
    expect(t1.pos.y).toBeLessThan(t0.pos.y) // downhill
  })

  // scene draw calls only: the low tier has no bloom, whose screen passes are not scene objects
  test('stays within the scene draw-call and triangle budget', async ({ page }) => {
    test.setTimeout(180_000)
    await page.goto('/?debug&quality=low')
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120_000 })
    await page.waitForTimeout(1500)
    const info = await page.evaluate(() => (window as unknown as { __drift: Debug }).__drift.renderInfo())
    expect(info.calls).toBeLessThanOrEqual(250)
    expect(info.triangles).toBeLessThanOrEqual(3_500_000)
  })
})
