import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('coach slug routing', () => {
  it('slugifies coach names for URL lookup', () => {
    expect(slugify('Sara Mohammadi')).toBe('sara-mohammadi')
  })
})
