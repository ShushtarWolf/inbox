import { describe, expect, it } from 'vitest'
import {
  courtAudienceAllowsGender,
  courtAudienceBlockReason,
  courtAudienceShowsTag,
  parseCourtAudience,
} from './courtAudience.ts'

describe('parseCourtAudience', () => {
  it('accepts enum and FA aliases', () => {
    expect(parseCourtAudience('WOMEN')).toBe('WOMEN')
    expect(parseCourtAudience('بانوان')).toBe('WOMEN')
    expect(parseCourtAudience('آقایان')).toBe('MEN')
    expect(parseCourtAudience('خانوادگی')).toBe('FAMILY')
    expect(parseCourtAudience('OPEN')).toBe('MIXED')
    expect(parseCourtAudience('nope')).toBeNull()
  })
})

describe('courtAudienceAllowsGender', () => {
  it('MIXED and FAMILY allow anyone', () => {
    expect(courtAudienceAllowsGender('MIXED', null)).toBe(true)
    expect(courtAudienceAllowsGender('FAMILY', 'MALE')).toBe(true)
    expect(courtAudienceAllowsGender('FAMILY', null)).toBe(true)
  })

  it('MEN/WOMEN require matching gender', () => {
    expect(courtAudienceAllowsGender('MEN', 'MALE')).toBe(true)
    expect(courtAudienceAllowsGender('MEN', 'FEMALE')).toBe(false)
    expect(courtAudienceAllowsGender('MEN', null)).toBe(false)
    expect(courtAudienceAllowsGender('WOMEN', 'FEMALE')).toBe(true)
    expect(courtAudienceAllowsGender('WOMEN', 'MALE')).toBe(false)
  })
})

describe('courtAudienceBlockReason / showsTag', () => {
  it('maps deny reasons and tags', () => {
    expect(courtAudienceBlockReason('WOMEN', 'MALE')).toBe('women_only')
    expect(courtAudienceBlockReason('MEN', null)).toBe('gender_required')
    expect(courtAudienceBlockReason('FAMILY', 'MALE')).toBeNull()
    expect(courtAudienceShowsTag('MIXED')).toBe(false)
    expect(courtAudienceShowsTag('WOMEN')).toBe(true)
  })
})
