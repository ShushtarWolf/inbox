import { describe, expect, it } from 'vitest'
import { adminNextTarget, sanitizeAdminNext } from './adminNext'

describe('adminNext', () => {
  it('guards only admin subpaths', () => {
    expect(adminNextTarget('/admin')).toBeNull()
    expect(adminNextTarget('/admin/users')).toBe('/admin/users')
    expect(adminNextTarget('/en/admin/clubs/x')).toBe('/admin/clubs/x')
    expect(adminNextTarget('/clubs')).toBeNull()
  })
  it('sanitizes next to admin-only same-origin paths', () => {
    expect(sanitizeAdminNext('/admin/calendar?clubSlug=a')).toBe('/admin/calendar?clubSlug=a')
    expect(sanitizeAdminNext('https://evil.com')).toBeNull()
    expect(sanitizeAdminNext('/admin//evil.com')).toBeNull()
    expect(sanitizeAdminNext('/owner')).toBeNull()
    expect(sanitizeAdminNext(undefined)).toBeNull()
  })
})
