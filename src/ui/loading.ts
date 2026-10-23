/**
 * The loading screen in index.html (plan Task 9.2): shown from the first byte,
 * with the about text so there is something to read while the mountain builds.
 * Progress is reported in coarse steps by Game.start.
 */
export class LoadingScreen {
  private readonly root: HTMLElement | null
  private readonly bar: HTMLElement | null
  private readonly label: HTMLElement | null

  constructor(doc: Document = document) {
    this.root = doc.querySelector<HTMLElement>('#loading')
    this.bar = doc.querySelector<HTMLElement>('#loading-bar')
    this.label = doc.querySelector<HTMLElement>('#loading-label')
  }

  /** fraction 0..1 and what is happening now */
  set(fraction: number, what: string): void {
    if (this.bar) this.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`
    if (this.label) this.label.textContent = what
    this.root?.setAttribute('aria-valuenow', String(Math.round(fraction * 100)))
  }

  /** Fade out and remove from the accessibility tree. */
  done(): void {
    if (!this.root) return
    this.root.classList.add('is-done')
    this.root.setAttribute('aria-hidden', 'true')
    setTimeout(() => (this.root!.hidden = true), 600)
  }
}
