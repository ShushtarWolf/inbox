import { describe, expect, it } from 'vitest'
import { applyGuestMobileInput, mergeGuestMobileFromDom } from './ownerDeskGuestForm.ts'

describe('ownerDeskGuestForm', () => {
  it('normalizes Persian digits on mobile input', () => {
    expect(applyGuestMobileInput('۰۹۱۲۱۲۳۴۵۶۷')).toBe('09121234567')
    expect(applyGuestMobileInput('09 12')).toBe('0912')
  })

  it('merges DOM autofill into the reactive model', () => {
    expect(mergeGuestMobileFromDom('', '09121234567')).toBe('09121234567')
    expect(mergeGuestMobileFromDom('0912', '09121234567')).toBe('09121234567')
    expect(mergeGuestMobileFromDom('09121', '')).toBe('09121')
  })
})