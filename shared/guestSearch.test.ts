import { describe, expect, it } from 'vitest'
import { buildGuestSearchHit, guestSearchHitToFormPair } from './guestSearch.ts'

describe('guestSearchHitToFormPair', () => {
  it('uses structured guestName and guestFamily from API hits', () => {
    const hit = buildGuestSearchHit({
      guestName: 'الهه',
      guestFamily: 'ربیعی',
      mobile: '09121234567',
      source: 'user',
    })
    expect(guestSearchHitToFormPair(hit)).toEqual({
      guestName: 'الهه',
      guestFamily: 'ربیعی',
    })
  })

  it('splits duplicated full first name when family is also set', () => {
    expect(
      guestSearchHitToFormPair({
        name: 'علی محمدی',
        guestName: 'علی محمدی',
        guestFamily: 'محمدی',
        mobile: '',
        source: 'booking',
      }),
    ).toEqual({
      guestName: 'علی',
      guestFamily: 'محمدی',
    })
  })

  it('splits legacy combined display name when parts are empty', () => {
    expect(
      guestSearchHitToFormPair({
        name: 'علی محمدی',
        guestName: '',
        guestFamily: '',
        mobile: '',
        source: 'contact',
      }),
    ).toEqual({
      guestName: 'علی',
      guestFamily: 'محمدی',
    })
  })
})
