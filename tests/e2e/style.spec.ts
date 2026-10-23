import { expect, test } from '@playwright/test'

/**
 * Style gate guard (spec §5): the frame's colour mass must sit in the reference's
 * dusk bands — magenta/violet sky and ground, red/orange foliage — not a generic look.
 */
test('the start view is dominated by the reference dusk palette', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 960, height: 540 })
  // low tier: software GL is too slow for the full post chain; hue bands don't depend on bloom
  await page.goto('/?debug&quality=low')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60_000 })
  await page.waitForTimeout(2500)
  const png = (await page.locator('#scene').screenshot()).toString('base64')
  const bands = await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 240
    c.height = 135
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0, c.width, c.height)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let dusk = 0
    let warm = 0
    let total = 0
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255
      const gg = d[i + 1] / 255
      const bb = d[i + 2] / 255
      const max = Math.max(r, gg, bb)
      const min = Math.min(r, gg, bb)
      const delta = max - min
      total++
      if (delta < 0.08) continue // greys don't count for either band
      let h = 0
      if (max === r) h = ((gg - bb) / delta) % 6
      else if (max === gg) h = (bb - r) / delta + 2
      else h = (r - gg) / delta + 4
      h = (h * 60 + 360) % 360
      if (h >= 260 || h < 10) dusk++
      else if (h >= 10 && h < 45) warm++
    }
    return { dusk: dusk / total, warm: warm / total }
  }, png)
  expect(bands.dusk).toBeGreaterThan(0.45)
  expect(bands.dusk + bands.warm).toBeGreaterThan(0.6)
})

test('reduced motion turns speed effects off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?debug')
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60_000 })
  expect(await page.evaluate(() => (window as unknown as { __drift: { speedFx: (s: number) => number } }).__drift.speedFx(40))).toBe(0)
})
