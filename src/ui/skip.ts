import { about, projects, routeNames } from '../content/projects'

export type SkipReason = 'user' | 'no-gpu' | 'slow' | 'context-lost'

const REASON_TEXT: Record<SkipReason, string> = {
  user: '',
  'no-gpu': 'Your browser cannot run the 3D mountain, so here is the short version.',
  slow: 'The mountain was running slowly on this device, so here is the short version.',
  'context-lost': 'The graphics driver reset, so here is the short version.',
}

/** Tiny DOM helper: element with optional class and text (textContent only, never HTML). */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

function externalLink(label: string, url: string, cls?: string): HTMLAnchorElement {
  const a = el('a', cls, label)
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener'
  return a
}

/**
 * "Skip the game": the recruiter path (spec §9). A modal with the about text,
 * all nine project cards and links. Opens by itself when the game can't run.
 * Built lazily on first open; one instance per page (`skipOverlay`).
 */
export class SkipOverlay {
  private root: HTMLElement | null = null
  private returnFocus: HTMLElement | null = null

  get isOpen(): boolean {
    return !!this.root && !this.root.hidden
  }

  open(reason: SkipReason): void {
    if (!this.isOpen) this.returnFocus = document.activeElement as HTMLElement | null
    const root = (this.root ??= this.build())
    const r = root.querySelector<HTMLElement>('#skip-reason')!
    r.textContent = REASON_TEXT[reason]
    r.hidden = reason === 'user'
    // when the game cannot run, there is nothing to go back to
    root.querySelector<HTMLButtonElement>('.skip__close')!.hidden = reason !== 'user'
    root.hidden = false
    const title = root.querySelector<HTMLElement>('.skip__title')!
    title.tabIndex = -1
    ;(root.querySelector<HTMLElement>('.skip__close:not([hidden])') ?? title).focus()
    document.dispatchEvent(new CustomEvent('skip:open', { detail: reason }))
  }

  close(): void {
    if (!this.root) return
    this.root.hidden = true
    this.returnFocus?.focus()
    this.returnFocus = null
    document.dispatchEvent(new CustomEvent('skip:close'))
  }

  private build(): HTMLElement {
    const wrap = el('div', 'skip')
    wrap.id = 'skip-overlay'
    wrap.setAttribute('role', 'dialog')
    wrap.setAttribute('aria-modal', 'true')
    wrap.setAttribute('aria-labelledby', 'skip-title')
    wrap.hidden = true

    const close = el('button', 'skip__close', 'Back to the mountain')
    close.type = 'button'
    close.addEventListener('click', () => this.close())
    const reason = el('p', 'skip__reason')
    reason.id = 'skip-reason'
    const title = el('h1', 'skip__title', about.name)
    title.id = 'skip-title'
    const skills = el('ul', 'skip__skills')
    for (const s of about.skills) skills.append(el('li', undefined, s.name))
    const grid = el('div', 'skip__cards')
    for (const p of projects) grid.append(this.card(p))
    const links = el('p', 'skip__links')
    for (const l of about.links) links.append(externalLink(l.label, l.url))

    const inner = el('div', 'skip__inner')
    inner.append(close, reason, title, el('p', 'skip__handle', `@${about.handle}`), el('p', 'skip__line', about.line), skills, grid, links)
    wrap.append(inner)
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !close.hidden) this.close()
      if (e.key === 'Tab') this.trapFocus(wrap, e)
    })
    document.body.append(wrap)
    return wrap
  }

  private card(p: (typeof projects)[number]): HTMLElement {
    const card = el('article', 'card')
    card.dataset.id = p.id
    const top = el('div', 'card__top')
    top.append(el('span', 'card__route', routeNames[p.route]), el('span', p.public ? 'card__tag card__tag--public' : 'card__tag', p.public ? 'public' : 'private'))
    const chips = el('ul', 'card__stack')
    for (const s of p.stack) chips.append(el('li', undefined, s))
    card.append(top, el('h2', 'card__title', p.title), el('p', 'card__blurb', p.blurb), chips)
    if (p.public && p.url) card.append(externalLink('View on GitHub', p.url, 'card__go'))
    return card
  }

  /** Keep Tab inside the dialog while it is open. */
  private trapFocus(container: HTMLElement, e: KeyboardEvent): void {
    const items = [...container.querySelectorAll<HTMLElement>('button:not([hidden]), a[href]')]
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

export const skipOverlay = new SkipOverlay()
