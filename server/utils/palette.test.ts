import { describe, expect, it } from 'vitest'
import { palette, BRAND_PRIMARY, BRAND_CREAM, BRAND_ACCENT } from './palette'

describe('brandbook palette', () => {
  it('uses shushzerv coach red as primary', () => {
    expect(BRAND_PRIMARY).toBe('#C41E1E')
    expect(palette.brand.primary).toBe('#C41E1E')
  })

  it('uses warm cream background', () => {
    expect(BRAND_CREAM).toBe('#F4EFE9')
    expect(palette.brand.cream).toBe('#F4EFE9')
  })

  it('uses gold accent from brand book', () => {
    expect(BRAND_ACCENT).toBe('#B68A3B')
    expect(palette.brand.gold).toBe('#B68A3B')
    expect(palette.brand.primarySoft).toBe('#C41E1E1A')
  })

  it('maps calendar slot colors to brand book', () => {
    expect(palette.slotDisplay.RESERVED).toBe('#C41E1E')
    expect(palette.slotDisplay.PUBLIC).toBe('#B68A3B')
    expect(palette.slotDisplay.TEAM).toBe('#6B1F28')
    expect(palette.slotDisplay.FREE).toBe('#E8E6E2')
  })

  it('uses warm gray text scale', () => {
    expect(palette.gray[800]).toBe('#2C2C2A')
    expect(palette.gray[500]).toBe('#6B6B67')
  })
})
