import { projects, routeNames, type CardId, type ProjectCard } from '../content/projects'
import '../styles/card.css'

export interface CardPanel {
  show(id: CardId): void
  hide(): void
  readonly openId: CardId | null
  dispose(): void
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text) e.textContent = text
  return e
}

function isControl(e: Element | null): boolean {
  if (!e) return false
  return e.matches('a[href], button, input, select, textarea, [contenteditable=""], [contenteditable="true"]')
}

const byId =new Map<CardId, ProjectCard>(projects.map((p) => [p.id, p]))

/**
 * In-game project card that slides in when a corner opens. Non-modal: it never
 * takes focus, so driving keeps working. While open, Escape closes it and
 * Enter opens the GitHub link of a public project in a new tab.
 */
export function createCardPanel(root: HTMLElement): CardPanel {
  const panel = el('aside', 'cardp')
  panel.id = 'card-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'false')
  panel.setAttribute('aria-labelledby', 'card-panel-title')
  panel.hidden = true

  const card = el('article', 'card cardp__card')
  const top = el('div', 'card__top')
  const route = el('span', 'card__route')
  const tag = el('span', 'card__tag')
  top.append(route, tag)
  const title = el('h2', 'card__title')
  title.id = 'card-panel-title'
  const blurb = el('p', 'card__blurb')
  const chips = el('ul', 'card__stack')
  const actions = el('div', 'cardp__actions')
  const link = el('a', 'card__go', 'View on GitHub')
  link.target = '_blank'
  link.rel = 'noopener'
  const keyHint = el('span', 'cardp__keys')
  const close = el('button', 'cardp__close')
  close.type = 'button'
  close.setAttribute('aria-label', 'Close project card')
  close.textContent = '×'
  actions.append(link, keyHint)
  card.append(close, top, title, blurb, chips, actions)
  panel.append(card)
  root.append(panel)

  let openId: CardId | null = null
  let url: string | null = null

  function returnFocusToGame() {
    // A mouse click on the close button or link focuses it; hand focus back to driving.
    if (panel.contains(document.activeElement)) {
      const scene = document.getElementById('scene')
      if (scene) scene.focus({ preventScroll: true })
      else (document.activeElement as HTMLElement | null)?.blur()
    }
  }

  function onKey(e: KeyboardEvent) {
    if (openId === null) return
    if (e.key === 'Escape') {
      e.preventDefault()
      hide()
    } else if (e.key === 'Enter' && !e.repeat && url) {
      // A focused control (panel close button, skip overlay link…) handles its own Enter.
      if (isControl(document.activeElement)) return
      e.preventDefault()
      window.open(url, '_blank', 'noopener')
    }
  }

  function show(id: CardId) {
    const p = byId.get(id)
    if (!p) return
    route.textContent = routeNames[p.route]
    tag.textContent = p.public ? 'public' : 'private'
    tag.className = p.public ? 'card__tag card__tag--public' : 'card__tag'
    title.textContent = p.title
    blurb.textContent = p.blurb
    chips.replaceChildren(...p.stack.map((s) => el('li', '', s)))
    url = p.public && p.url ? p.url : null
    if (url) link.href = url
    else link.removeAttribute('href')
    link.hidden = !url
    keyHint.textContent = url ? 'Enter to open · Esc to close' : 'Esc to close'
    if (openId === null) window.addEventListener('keydown', onKey)
    openId = id
    panel.hidden = false
    panel.dataset.id = id
  }

  function hide() {
    if (openId === null) return
    window.removeEventListener('keydown', onKey)
    returnFocusToGame()
    openId = null
    url = null
    panel.hidden = true
    delete panel.dataset.id
  }

  close.addEventListener('click', hide)
  link.addEventListener('click', () => queueMicrotask(returnFocusToGame))

  return {
    show,
    hide,
    get openId() {
      return openId
    },
    dispose() {
      hide()
      panel.remove()
    },
  }
}
