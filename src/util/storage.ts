/**
 * localStorage wrapper that never throws (Review Focus #4: Safari private mode,
 * sandboxed iframes, quota). Values are JSON. Writes always land in an
 * in-memory copy first, so a blocked backend still works for the session.
 */
export class SafeStorage {
  private readonly backend: Storage | null
  /** session copy of every value written, as JSON (so callers can't mutate it) */
  private readonly memory = new Map<string, string>()

  /**
   * @param prefix namespace prepended to every key (e.g. `'drift-folio:'`)
   * @param backend storage to use; `undefined` = window.localStorage, `null` = memory only
   */
  constructor(private readonly prefix: string, backend?: Storage | null) {
    this.backend = backend === undefined ? SafeStorage.defaultBackend() : backend
  }

  /** Stored value, or `fallback` when missing, unreadable or corrupted. */
  get<T>(key: string, fallback: T): T {
    const raw = this.read(key)
    if (raw === null) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }

  /** Persist `value`. Returns false when the backend refused it (value is still kept in memory). */
  set(key: string, value: unknown): boolean {
    let raw: string | undefined
    try {
      raw = JSON.stringify(value)
    } catch {
      return false // cyclic, BigInt…
    }
    if (raw === undefined) return false
    this.memory.set(key, raw)
    if (!this.backend) return false
    try {
      this.backend.setItem(this.prefix + key, raw)
      return true
    } catch {
      return false
    }
  }

  private read(key: string): string | null {
    const cached = this.memory.get(key)
    if (cached !== undefined) return cached
    if (!this.backend) return null
    try {
      return this.backend.getItem(this.prefix + key)
    } catch {
      return null
    }
  }

  private static defaultBackend(): Storage | null {
    try {
      return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
    } catch {
      // accessing the getter itself throws in some sandboxed iframes
      return null
    }
  }
}
