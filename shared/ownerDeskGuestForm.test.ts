import { describe, expect, it } from 'vitest'
import {
  applyGuestDeskInputsFromModel,
  applyGuestMobileInput,
  mergeGuestMobileFromDom,
} from './ownerDeskGuestForm.ts'

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

  it('paints guest desk inputs from the model after suggestion pick', () => {
    const guestName = { value: 'be' }
    const guestFamily = { value: '' }
    const guestMobile = { value: '' }
    applyGuestDeskInputsFromModel(
      { guestName: 'بهنام', guestFamily: 'تابودی', guestMobile: '09121234567' },
      { guestName, guestFamily, guestMobile },
    )
    expect(guestName.value).toBe('بهنام')
    expect(guestFamily.value).toBe('تابودی')
    expect(guestMobile.value).toBe('09121234567')
  })
})