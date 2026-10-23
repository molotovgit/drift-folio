import { projects, routeNames, type CardId, type ProjectCard } from '../content/projects'
import '../styles/card.css'
import { SafeUrl } from '../util/safeUrl'
import { skipOverlay } from './skip'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text) e.textContent = text
  return e
}

/** Focused element that handles Enter itself (so the panel must not). */
function isControl(e: Element | null): boolean {
  if (!e) return false
  return e.matches('a[href], button, input, select, textarea, [contenteditable=""], [contenteditable="true"]')
}

const BY_ID = new Map<CardId, ProjectCard>(projects.map((p) => [p.id, p]))

/**
 * In-game project card that slides in when a corner opens. Non-modal: it never
 * takes focus, so driving keeps working. While open, Escape closes it and
 * Enter opens the GitHub link of a public project in a new tab. Both keys
 * belong to the skip overlay while it is open over the game.
 */
export class CardPanel {
  private readonly panel: HTMLElement
  private readonly route: HTMLElement
  private readonly tag: HTMLElement
  private readonly title: HTMLElement
  private readonly blurb: HTMLElement
  private readonly chips: HTMLUListElement
  private readonly link: HTMLAnchorElement
  private readonly keyHint: HTMLElement

  private current: CardId | null = null
  private url: string | null = null
  // bound once so add/removeEventListener match
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e)

  /**
   * @param root element the panel is appended to
   * @param blocked true while another layer owns the keyboard (default: the skip overlay)
   */
  constructor(
    root: HTMLElement,
    private readonly blocked: () => boolean = () => skipOverlay.isOpen,
  ) {
    this.panel = el('aside', 'cardp')
    this.panel.id = 'card-panel'
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-modal', 'false')
    this.panel.setAttribute('aria-labelledby', 'card-panel-title')
    this.panel.hidden = true

    const card = el('article', 'card cardp__card')
    const top = el('div', 'card__top')
    this.route = el('span', 'card__route')
    this.tag = el('span', 'card__tag')
    top.append(this.route, this.tag)
    this.title = el('h2', 'card__title')
    this.title.id = 'card-panel-title'
    this.blurb = el('p', 'card__blurb')
    this.chips = el('ul', 'card__stack')
    const actions = el('div', 'cardp__actions')
    this.link = el('a', 'card__go', 'View on GitHub')
    this.link.target = '_blank'
    this.link.rel = 'noopener'
    this.keyHint = el('span', 'cardp__keys')
    const close = el('button', 'cardp__close', '×')
    close.type = 'button'
    close.setAttribute('aria-label', 'Close project card')
    actions.append(this.link, this.keyHint)
    card.append(close, top, this.title, this.blurb, this.chips, actions)
    this.panel.append(card)
    root.append(this.panel)

    close.addEventListener('click', () => this.hide())
    this.link.addEventListener('click', () => queueMicrotask(() => this.returnFocusToGame()))
  }

  /** Card currently shown, or null. */
  get openId(): CardId | null {
    return this.current
  }

  /** Fill the panel with project `id` and show it (replaces any open card). */
  show(id: CardId): void {
    const p = BY_ID.get(id)
    if (!p) return
    this.route.textContent = routeNames[p.route]
    this.tag.textContent = p.public ? 'public' : 'private'
    this.tag.className = p.public ? 'card__tag card__tag--public' : 'card__tag'
    this.title.textContent = p.title
    this.blurb.textContent = p.blurb
    this.chips.replaceChildren(...p.stack.map((s) => el('li', '', s)))
    // only GitHub links are ever opened from a card
    this.url = p.public ? SafeUrl.https(p.url, 'https://github.com/') : null
    if (this.url) this.link.href = this.url
    else this.link.removeAttribute('href')
    this.link.hidden = !this.url
    this.keyHint.textContent = this.url ? 'Enter to open · Esc to close' : 'Esc to close'
    if (this.current === null) window.addEventListener('keydown', this.onKey)
    this.current = id
    this.panel.hidden = false
    this.panel.dataset.id = id
  }

  hide(): void {
    if (this.current === null) return
    window.removeEventListener('keydown', this.onKey)
    this.returnFocusToGame()
    this.current = null
    this.url = null
    this.panel.hidden = true
    delete this.panel.dataset.id
  }

  dispose(): void {
    this.hide()
    this.panel.remove()
  }

  private handleKey(e: KeyboardEvent): void {
    // defaultPrevented: the skip overlay already handled this key (it closes before we see it)
    if (this.current === null || e.defaultPrevented || this.blocked()) return
    if (e.key === 'Escape') {
      e.preventDefault()
      this.hide()
    } else if (e.key === 'Enter' && !e.repeat && this.url) {
      // a focused control (panel close button, skip overlay link…) handles its own Enter
      if (isControl(document.activeElement)) return
      e.preventDefault()
      window.open(this.url, '_blank', 'noopener')
    }
  }

  /** A mouse click on the close button or link focuses it; hand focus back to driving. */
  private returnFocusToGame(): void {
    if (!this.panel.contains(document.activeElement)) return
    // the canvas has tabindex="-1" so it can take focus; blur is the fallback
    document.getElementById('scene')?.focus({ preventScroll: true })
    if (this.panel.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
  }
}
