import { describe, expect, it } from 'vitest'
import { SafeUrl } from '../../src/util/safeUrl'

describe('SafeUrl.https', () => {
  it('accepts https links', () => {
    expect(SafeUrl.https('https://github.com/molotovgit')).toBe('https://github.com/molotovgit')
  })

  it('rejects other schemes, malformed and missing links', () => {
    for (const bad of ['javascript:alert(1)', 'http://example.com', 'mailto:a@b.c', 'https://', 'github.com/x', '', undefined]) expect(SafeUrl.https(bad)).toBeNull()
  })

  it('enforces a prefix when given', () => {
    expect(SafeUrl.https('https://github.com/a/b', 'https://github.com/')).toBe('https://github.com/a/b')
    expect(SafeUrl.https('https://evil.example/github.com/', 'https://github.com/')).toBeNull()
  })
})
