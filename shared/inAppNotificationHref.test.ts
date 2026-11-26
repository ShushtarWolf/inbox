import { describe, expect, it } from 'vitest'
import { inAppNotificationHref } from './inAppNotificationHref'

describe('inAppNotificationHref', () => {
  it('prefers explicit metadata href', () => {
    expect(inAppNotificationHref('BOOKING_PAID', { href: '/owner/calendar' })).toBe('/owner/calendar')
  })

  it('defaults discount application requests tab for owners', () => {
    expect(inAppNotificationHref('DISCOUNT_APPLICATION', { clubId: 'c1' })).toBe(
      '/owner/discounts?tab=requests',
    )
  })

  it('returns null for unknown types', () => {
    expect(inAppNotificationHref('WAITLIST', null)).toBeNull()
  })
})