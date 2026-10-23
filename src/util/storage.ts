/**
 * localStorage wrapper that never throws (Review Focus #4: Safari private mode,
 * sandboxed iframes, quota). Values are JSON. Writes always land in an
 * in-memory copy first, so a blocked backend still works for the session.
 */
export interface SafeStorage {
  /** Stored value, or `fallback` when missing, unreadable or corrupted. */
  get<T>(key: string, fallback: T): T
  /** Persist `value`. Returns false when the backend refused it (value is still kept in memory). */
  set(key: string, value: unknown): boolean
}

function defaultBackend(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
  } catch {
    // Accessing the getter itself throws in some sandboxed iframes.
    return null
  }
}

/**
 * @param prefix namespace prepended to every key (e.g. `'drift-folio:'`)
 * @param backend storage to use; `undefined` = window.localStorage, `null` = memory only
 */
export function createStorage(prefix: string, backend?: Storage | null): SafeStorage {
  const store = backend === undefined ? defaultBackend() : backend
  const memory = new Map<string, string>()

  function read(key: string): string | null {
    const cached = memory.get(key)
    if (cached !== undefined) return cached
    if (!store) return null
    try {
      return store.getItem(prefix + key)
    } catch {
      return null
    }
  }

  return {
    get<T>(key: string, fallback: T): T {
      const raw = read(key)
      if (raw === null) return fallback
      try {
        return JSON.parse(raw) as T
      } catch {
        return fallback
      }
    },
    set(key: string, value: unknown): boolean {
      let raw: string | undefined
      try {
        raw = JSON.stringify(value)
      } catch {
        return false
      }
      if (raw === undefined) return false
      memory.set(key, raw)
      if (!store) return false
      try {
        store.setItem(prefix + key, raw)
        return true
      } catch {
        return false
      }
    },
  }
}
