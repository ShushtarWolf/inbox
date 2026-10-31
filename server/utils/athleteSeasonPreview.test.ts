import { describe, expect, it } from 'vitest'
import { resolveAthleteWeeklyEndTime } from './athleteSeasonPreview'

describe('resolveAthleteWeeklyEndTime', () => {
  it('keeps explicit 24:00 end for a 23:00 start', () => {
    expect(resolveAthleteWeeklyEndTime('23:00', '24:00')).toBe('24:00')
  })

  it('defaults to +60 minutes when end is missing', () => {
    expect(resolveAthleteWeeklyEndTime('18:00')).toBe('19:00')
  })
})
