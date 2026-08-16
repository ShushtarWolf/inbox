import { describe, expect, it } from 'vitest'
import { buildHourlyOptions, formatMinutesAsTime } from './courtFacilities'

describe('formatMinutesAsTime', () => {
  it('formats midnight close as 24:00', () => {
    expect(formatMinutesAsTime(1440)).toBe('24:00')
  })

  it('formats ordinary times', () => {
    expect(formatMinutesAsTime(0)).toBe('00:00')
    expect(formatMinutesAsTime(8 * 60)).toBe('08:00')
    expect(formatMinutesAsTime(23 * 60 + 30)).toBe('23:30')
  })
})

describe('buildHourlyOptions', () => {
  it('excludes close by default', () => {
    expect(buildHourlyOptions(8, 24)).toEqual([
      '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00',
      '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
    ])
  })

  it('includes 24:00 when includeClose is true', () => {
    const options = buildHourlyOptions(8, 24, 60, true)
    expect(options.at(-1)).toBe('24:00')
    expect(options).toContain('23:00')
  })

  it('includes close with 30-minute steps as 24:00 not 23:30-only', () => {
    const options = buildHourlyOptions(8, 24, 30, true)
    expect(options.at(-2)).toBe('23:30')
    expect(options.at(-1)).toBe('24:00')
  })
})
