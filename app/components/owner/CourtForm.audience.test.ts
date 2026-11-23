import { describe, expect, it } from 'vitest'
import {
  courtAudienceToSelection,
  selectionToCourtAudience,
  type CourtAudienceUiSegment,
} from '#shared/courtAudience.ts'

/** Mirrors CourtForm toggle guard: cannot turn off the last active segment. */
function toggleCourtAudienceSegment(
  men: boolean,
  women: boolean,
  segment: CourtAudienceUiSegment,
): { men: boolean; women: boolean } {
  if (segment === 'MEN') {
    if (men && !women) return { men, women }
    return { men: !men, women }
  }
  if (women && !men) return { men, women }
  return { men, women: !women }
}

describe('CourtForm audience toggles (logic)', () => {
  it('defaults new court to both segments (MIXED)', () => {
    const sel = courtAudienceToSelection('MIXED')
    expect(selectionToCourtAudience(sel)).toBe('MIXED')
  })

  it('loads legacy FAMILY as both toggles on', () => {
    const sel = courtAudienceToSelection('FAMILY')
    expect(sel).toEqual({ men: true, women: true })
    expect(selectionToCourtAudience(sel)).toBe('MIXED')
  })

  it('prevents unchecking the last active segment', () => {
    expect(toggleCourtAudienceSegment(true, false, 'MEN')).toEqual({ men: true, women: false })
    expect(toggleCourtAudienceSegment(false, true, 'WOMEN')).toEqual({ men: false, women: true })
    expect(toggleCourtAudienceSegment(true, true, 'MEN')).toEqual({ men: false, women: true })
    expect(toggleCourtAudienceSegment(false, true, 'MEN')).toEqual({ men: true, women: true })
  })
})