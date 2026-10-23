/** ↑ ↑ ↓ ↓ ← → ← → B A */
export const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'] as const

/**
 * Watches key codes for a sequence (the Konami code by default) and fires a
 * callback when it is typed in order. Any wrong key restarts the match (but a
 * wrong key that is itself the first key of the sequence counts as a restart).
 */
export class KeySequence {
  private index = 0

  constructor(
    private readonly onMatch: () => void,
    private readonly sequence: readonly string[] = KONAMI,
  ) {}

  /** Feed one key code; returns true when the sequence completes. */
  push(code: string): boolean {
    if (code === this.sequence[this.index]) {
      this.index++
    } else {
      // allow overlapping restarts, e.g. ↑ ↑ ↑ ↓ … still matches
      this.index = code === this.sequence[0] ? (this.index > 0 && this.sequence[1] === code ? this.index : 1) : 0
    }
    if (this.index === this.sequence.length) {
      this.index = 0
      this.onMatch()
      return true
    }
    return false
  }

  /** Attach to a keyboard event target; returns a detach function. */
  listen(target: EventTarget): () => void {
    const handler = (e: Event) => void this.push((e as KeyboardEvent).code)
    target.addEventListener('keydown', handler)
    return () => target.removeEventListener('keydown', handler)
  }
}
