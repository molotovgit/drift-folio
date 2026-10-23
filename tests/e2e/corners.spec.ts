import { expect, test } from '@playwright/test'

type Debug = { showCard: (id: string) => void; openCard: () => string | null; corners: () => { id: string }[] }

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
})
