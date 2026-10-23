import { expect, test } from '@playwright/test'

type V3 = { x: number; y: number; z: number }
type Corner = { id: string; edgeId: string; index: number; clip: V3; turn: number }
type Debug = {
  showCard: (id: string) => void
  openCard: () => string | null
  corners: () => Corner[]
  teleportIndex: (edgeId: string, index: number) => boolean
  teleportTo: (x: number, z: number, yaw?: number) => void
  launch: (speed: number, slipDeg?: number) => void
  railHits: () => number
  telemetry: () => { pos: V3; yaw: number; drifting: boolean }
}

test.describe('project corners and cards (M5)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000)
    await page.goto('/?debug&quality=low')
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 150_000 })
  })

  test('all nine corners are placed on the mountain', async ({ page }) => {
    const ids = await page.evaluate(() => (window as unknown as { __drift: Debug }).__drift.corners().map((c) => c.id).sort())
    expect(ids).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'])
  })

  test('a public card links to GitHub; a private card has no link', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __drift: Debug }).__drift.showCard('C4'))
    const panel = page.locator('#card-panel')
    await expect(panel).toBeVisible()
    await expect(panel.locator('a.card__go')).toHaveAttribute('href', /^https:\/\/github\.com\/molotovgit\//)
    await page.evaluate(() => (window as unknown as { __drift: Debug }).__drift.showCard('C1'))
    await expect(panel.locator('.card__title')).toContainText('Akademiya')
    await expect(panel.locator('a.card__go')).toBeHidden()
    await expect(panel.locator('.card__tag')).toContainText(/private/i)
  })

  test('Escape closes the card and driving keys still work', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __drift: Debug }).__drift.showCard('C5'))
    await page.keyboard.press('Escape')
    await expect.poll(() => page.evaluate(() => (window as unknown as { __drift: Debug }).__drift.openCard())).toBeNull()
  })

  test('drifting through an apex opens that corner card', async ({ page }) => {
    const id = await page.evaluate(() => {
      const d = (window as unknown as { __drift: Debug }).__drift
      const c = d.corners()[0]
      // 8 m before the apex, sliding 30° toward the inside of the bend
      d.teleportIndex(c.edgeId, c.index - 4)
      d.launch(18, 30 * Math.sign(c.turn))
      return c.id
    })
    await expect.poll(() => page.evaluate(() => (window as unknown as { __drift: Debug }).__drift.openCard()), { timeout: 20_000 }).toBe(id)
    await expect(page.locator('#card-panel')).toBeVisible()
  })

  test('slamming the outside guard rail counts as a crash', async ({ page }) => {
    const before = await page.evaluate(() => (window as unknown as { __drift: Debug }).__drift.railHits())
    await page.evaluate(() => {
      const d = (window as unknown as { __drift: Debug }).__drift
      const c = d.corners()[0]
      // stand on the centreline at the apex, facing away from the clipping point (the outside rail)
      d.teleportIndex(c.edgeId, c.index)
      const t = d.telemetry()
      const yawOut = Math.atan2(t.pos.x - c.clip.x, t.pos.z - c.clip.z)
      d.teleportTo(t.pos.x, t.pos.z, yawOut)
      d.launch(25, 0)
    })
    await expect.poll(() => page.evaluate(() => (window as unknown as { __drift: Debug }).__drift.railHits()), { timeout: 20_000 }).toBeGreaterThan(before)
  })
})
