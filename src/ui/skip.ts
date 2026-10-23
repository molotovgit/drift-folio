import { about, projects, routeNames } from '../content/projects'

export type SkipReason = 'user' | 'no-gpu' | 'slow' | 'context-lost'

const reasonText: Record<SkipReason, string> = {
  user: '',
  'no-gpu': 'Your browser cannot run the 3D mountain, so here is the short version.',
  slow: 'The mountain was running slowly on this device, so here is the short version.',
  'context-lost': 'The graphics driver reset, so here is the short version.',
}

let root: HTMLElement | null = null
let returnFocus: HTMLElement | null = null

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

function build(): HTMLElement {
  const wrap = el('div', 'skip')
  wrap.id = 'skip-overlay'
  wrap.setAttribute('role', 'dialog')
  wrap.setAttribute('aria-modal', 'true')
  wrap.setAttribute('aria-labelledby', 'skip-title')
  wrap.hidden = true

  const inner = el('div', 'skip__inner')
  const close = el('button', 'skip__close', 'Back to the mountain')
  close.type = 'button'
  close.addEventListener('click', closeSkipOverlay)
  const reason = el('p', 'skip__reason')
  reason.id = 'skip-reason'
  const h = el('h1', 'skip__title', about.name)
  h.id = 'skip-title'
  const handle = el('p', 'skip__handle', `@${about.handle}`)
  const line = el('p', 'skip__line', about.line)

  const skills = el('ul', 'skip__skills')
  for (const s of about.skills) skills.append(el('li', undefined, s.name))

  const grid = el('div', 'skip__cards')
  for (const p of projects) {
    const card = el('article', 'card')
    card.dataset.id = p.id
    const top = el('div', 'card__top')
    top.append(el('span', 'card__route', routeNames[p.route]), el('span', p.public ? 'card__tag card__tag--public' : 'card__tag', p.public ? 'public' : 'private'))
    const title = el('h2', 'card__title', p.title)
    const blurb = el('p', 'card__blurb', p.blurb)
    const chips = el('ul', 'card__stack')
    for (const s of p.stack) chips.append(el('li', undefined, s))
    card.append(top, title, blurb, chips)
    if (p.public && p.url) {
      const a = el('a', 'card__go', 'View on GitHub')
      a.href = p.url
      a.target = '_blank'
      a.rel = 'noopener'
      card.append(a)
    }
    grid.append(card)
  }

  const links = el('p', 'skip__links')
  for (const l of about.links) {
    const a = el('a', undefined, l.label)
    a.href = l.url
    a.target = '_blank'
    a.rel = 'noopener'
    links.append(a)
  }

  inner.append(close, reason, h, handle, line, skills, grid, links)
  wrap.append(inner)
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !close.hidden) closeSkipOverlay()
    if (e.key === 'Tab') trapFocus(wrap, e)
  })
  document.body.append(wrap)
  return wrap
}

function trapFocus(container: HTMLElement, e: KeyboardEvent) {
  const items = [...container.querySelectorAll<HTMLElement>('button:not([hidden]), a[href]')]
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

export function openSkipOverlay(reason: SkipReason): void {
  if (!isSkipOpen()) returnFocus = document.activeElement as HTMLElement | null
  root ??= build()
  const r = root.querySelector<HTMLElement>('#skip-reason')!
  r.textContent = reasonText[reason]
  r.hidden = reason === 'user'
  // When the game cannot run, there is nothing to go back to.
  root.querySelector<HTMLButtonElement>('.skip__close')!.hidden = reason !== 'user'
  root.hidden = false
  const title = root.querySelector<HTMLElement>('.skip__title')!
  title.tabIndex = -1
  const closeBtn = root.querySelector<HTMLElement>('.skip__close:not([hidden])')
  ;(closeBtn ?? title).focus()
  document.dispatchEvent(new CustomEvent('skip:open', { detail: reason }))
}

export function closeSkipOverlay(): void {
  if (!root) return
  root.hidden = true
  returnFocus?.focus()
  returnFocus = null
  document.dispatchEvent(new CustomEvent('skip:close'))
}

export function isSkipOpen(): boolean {
  return !!root && !root.hidden
}
