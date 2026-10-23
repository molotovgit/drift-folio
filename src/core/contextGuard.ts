/**
 * Gives a lost GPU context a grace window to come back before we give up
 * and show the text overlay (Review Focus #3: "does not restore in 3 s").
 */
export interface ContextGuard {
  lost(): void
  restored(): void
  readonly isLost: boolean
}

type Timers = {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

export function createContextGuard(onGiveUp: () => void, graceMs = 3000, timers: Timers = realTimers): ContextGuard {
  let handle: unknown = null
  let isLost = false
  return {
    lost() {
      if (isLost) return
      isLost = true
      handle = timers.set(() => {
        handle = null
        if (isLost) onGiveUp()
      }, graceMs)
    },
    restored() {
      isLost = false
      if (handle !== null) timers.clear(handle)
      handle = null
    },
    get isLost() {
      return isLost
    },
  }
}
