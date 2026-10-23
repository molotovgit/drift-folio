// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardPanel } from '../../src/ui/card'

const key = (k: string, target: EventTarget = window) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

describe('card panel', () => {
  let root: HTMLElement
  let canvas: HTMLCanvasElement
  let panel: CardPanel
  let open: ReturnType<typeof vi.fn>
  let overlayOpen: boolean

  beforeEach(() => {
    document.body.innerHTML = '<canvas id="scene" tabindex="-1"></canvas><div id="hud"></div>'
    canvas = document.getElementById('scene') as HTMLCanvasElement
    root = document.getElementById('hud')!
    canvas.focus()
    open = vi.fn()
    vi.stubGlobal('open', open)
    overlayOpen = false
    panel = new CardPanel(root, () => overlayOpen)
  })
  afterEach(() => {
    panel.dispose()
    vi.unstubAllGlobals()
  })

  const dlg = () => root.querySelector<HTMLElement>('#card-panel')!

  it('starts hidden and accessible', () => {
    expect(panel.openId).toBeNull()
    expect(dlg().hidden).toBe(true)
    expect(dlg().getAttribute('role')).toBe('dialog')
    expect(dlg().getAttribute('aria-modal')).toBe('false')
    expect(document.getElementById(dlg().getAttribute('aria-labelledby')!)?.textContent).toBe('')
  })

  it('public card shows a GitHub link and Enter opens it', () => {
    panel.show('C4')
    expect(panel.openId).toBe('C4')
    expect(dlg().hidden).toBe(false)
    expect(dlg().querySelector('#card-panel-title')!.textContent).toBe('C&C Generals Zero Hour on Android')
    expect(dlg().querySelector('.card__route')!.textContent).toBe('Systems Drop')
    expect(dlg().querySelector('.card__tag')!.textContent).toBe('public')
    expect([...dlg().querySelectorAll('.card__stack li')].map((l) => l.textContent)).toEqual(['C++', 'SDL3', 'Vulkan', 'Android'])
    const a = dlg().querySelector<HTMLAnchorElement>('a[href^="https://github.com/molotovgit/"]')!
    expect(a.hidden).toBe(false)
    expect(a.target).toBe('_blank')
    expect(a.rel).toBe('noopener')
    key('Enter', canvas)
    expect(open).toHaveBeenCalledWith('https://github.com/molotovgit/CnC-Generals-ZeroHour-Android', '_blank', 'noopener')
  })

  it('private card has a private tag, no link, and Enter does nothing', () => {
    panel.show('C1')
    expect(dlg().querySelector('.card__tag')!.textContent).toBe('private')
    expect(dlg().querySelector('a[href]')).toBeNull()
    key('Enter', canvas)
    expect(open).not.toHaveBeenCalled()
  })

  it('does not steal focus from the canvas', () => {
    panel.show('C5')
    expect(document.activeElement).toBe(canvas)
  })

  it('while the skip overlay is open, Enter and Escape belong to it', () => {
    panel.show('C4')
    overlayOpen = true
    key('Escape', canvas)
    key('Enter', canvas)
    expect(panel.openId).toBe('C4')
    expect(open).not.toHaveBeenCalled()
    overlayOpen = false
    key('Escape', canvas)
    expect(panel.openId).toBeNull()
  })

  it('ignores a key another layer already handled (preventDefault)', () => {
    const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    handled.preventDefault()
    panel.show('C4')
    canvas.dispatchEvent(handled)
    expect(panel.openId).toBe('C4')
  })

  it('Escape closes; keys are ignored once closed', () => {
    panel.show('C4')
    key('Escape', canvas)
    expect(panel.openId).toBeNull()
    expect(dlg().hidden).toBe(true)
    key('Enter', canvas)
    expect(open).not.toHaveBeenCalled()
  })

  it('close button hides and hands focus back to the canvas', () => {
    panel.show('C6')
    const btn = dlg().querySelector<HTMLButtonElement>('.cardp__close')!
    btn.focus()
    btn.click()
    expect(panel.openId).toBeNull()
    expect(document.activeElement).toBe(canvas)
  })

  it('Enter on a focused button is left to the button', () => {
    panel.show('C4')
    dlg().querySelector<HTMLButtonElement>('.cardp__close')!.focus()
    key('Enter', document.activeElement!)
    expect(open).not.toHaveBeenCalled()
  })

  it('showing another card swaps content without duplicating listeners', () => {
    panel.show('C4')
    panel.show('C8')
    expect(panel.openId).toBe('C8')
    key('Enter', canvas)
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('https://github.com/molotovgit/cca-v6.2', '_blank', 'noopener')
    panel.show('C3') // private: link hidden again
    expect(dlg().querySelector('a[href]')).toBeNull()
  })
})
