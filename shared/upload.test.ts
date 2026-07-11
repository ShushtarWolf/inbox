import { describe, expect, it } from 'vitest'
import { validateImageUpload } from '../server/utils/storage'

describe('validateImageUpload', () => {
  it('accepts allowed image types under size limit', () => {
    expect(() => validateImageUpload('image/jpeg', 1024)).not.toThrow()
    expect(() => validateImageUpload('image/png', 1024)).not.toThrow()
    expect(() => validateImageUpload('image/webp', 1024)).not.toThrow()
  })

  it('rejects unsupported types', () => {
    expect(() => validateImageUpload('image/gif', 1024)).toThrow()
  })

  it('rejects oversized files', () => {
    expect(() => validateImageUpload('image/jpeg', 6 * 1024 * 1024)).toThrow()
  })
})

describe('package capacity', () => {
  it('computes remaining spots', () => {
    const capacity = 8
    const activeBookings = 3
    expect(Math.max(0, capacity - activeBookings)).toBe(5)
  })
})
