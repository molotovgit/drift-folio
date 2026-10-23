import { expect, test } from '@playwright/test'

test('boots with no console errors and shows the canvas', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.locator('#scene')).toBeVisible()
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1' || document.documentElement.dataset.gpu === 'none', null, { timeout: 30_000 })
  expect(errors).toEqual([])
})

test('the FD model loads (not the grey-box fallback)', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/?debug&map=pad')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 100_000 })
  expect(await page.evaluate(() => (window as unknown as { __drift: { carModel: () => boolean } }).__drift.carModel())).toBe(true)
})

test('skip link shows all nine cards; public ones link to GitHub, private ones do not', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Skip the game' }).click()
  await expect(page.locator('#skip-overlay .card')).toHaveCount(9)
  await expect(page.locator('.card[data-id="C4"] a.card__go')).toHaveAttribute('href', /github\.com\/molotovgit\//)
  await expect(page.locator('.card[data-id="C1"] a')).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to the mountain' }).click()
  await expect(page.locator('#skip-overlay')).toBeHidden()
})

test('opens the overlay by itself when no GPU backend exists', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true })
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
      if (id === 'webgl2' || id === 'webgl') return null
      return (orig as (...a: unknown[]) => unknown).call(this, id, ...rest)
    } as typeof orig
  })
  await page.goto('/')
  await expect(page.locator('#skip-overlay')).toBeVisible()
  await expect(page.locator('#skip-reason')).toContainText('cannot run')
  await expect(page.getByRole('button', { name: 'Back to the mountain' })).toBeHidden()
})

test('a lost WebGL context that does not restore within 3 s opens the overlay', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }))
  await page.goto('/')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1')
  expect(await page.evaluate(() => document.documentElement.dataset.gpu)).toBe('webgl2')
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('#scene')!.getContext('webgl2')!
    gl.getExtension('WEBGL_lose_context')!.loseContext()
  })
  await page.waitForTimeout(1500)
  await expect(page.locator('#skip-overlay')).toHaveCount(0)
  await expect(page.locator('#skip-overlay')).toBeVisible({ timeout: 4000 })
  await expect(page.locator('#skip-reason')).toContainText('graphics driver reset')
})

test('a WebGL context restored inside the window reloads the page into a working scene', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }))
  await page.goto('/')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1')
  const reloaded = page.waitForEvent('load')
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('#scene')!.getContext('webgl2')!
    const ext = gl.getExtension('WEBGL_lose_context')!
    ext.loseContext()
    setTimeout(() => ext.restoreContext(), 800)
  })
  await reloaded
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1')
  await expect(page.locator('#skip-overlay')).toHaveCount(0)
})
