import type { SafeStorage } from '../util/storage'

export type ShortcutId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6'
export const SHORTCUT_IDS: readonly ShortcutId[] = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']

export const SHORTCUT_NAMES: Record<ShortcutId, string> = {
  S1: 'The jump',
  S2: 'Dry riverbed',
  S3: 'Broken rail',
  S4: 'Rest-stop cut',
  S5: 'Beat the train',
  S6: 'Hidden peak',
}

/**
 * Which shortcuts the player has found (spec §6: finding all six lights a
 * lantern each in town). Persisted; each one is reported as new only once.
 */
export class ShortcutDiscovery {
  private readonly found: Set<ShortcutId>

  constructor(private readonly storage: SafeStorage) {
    const saved = storage.get<string[]>('shortcuts', [])
    this.found = new Set(saved.filter((s): s is ShortcutId => (SHORTCUT_IDS as readonly string[]).includes(s)))
  }

  /** Mark found; returns true only the first time. */
  discover(id: ShortcutId): boolean {
    if (this.found.has(id)) return false
    this.found.add(id)
    this.storage.set('shortcuts', [...this.found])
    return true
  }

  has(id: ShortcutId): boolean {
    return this.found.has(id)
  }

  get count(): number {
    return this.found.size
  }

  /** Lantern index (0..5) for a shortcut. */
  static lanternOf(id: ShortcutId): number {
    return SHORTCUT_IDS.indexOf(id)
  }

  all(): ShortcutId[] {
    return SHORTCUT_IDS.filter((s) => this.found.has(s))
  }
}
