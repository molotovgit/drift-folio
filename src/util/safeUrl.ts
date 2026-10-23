/**
 * Link validation for everything the game opens in a new tab (cards, town
 * pads). Content is edited by hand, so a typo or a `javascript:` URL must
 * never reach `window.open` or an `href`.
 */
export class SafeUrl {
  /** `url` if it parses as an https URL (and starts with `prefix`, when given), else null. */
  static https(url: string | undefined, prefix = 'https://'): string | null {
    if (!url || !url.startsWith(prefix)) return null
    try {
      return new URL(url).protocol === 'https:' ? url : null
    } catch {
      return null
    }
  }
}
