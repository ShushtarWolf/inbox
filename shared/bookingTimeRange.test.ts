import { describe, expect, it } from 'vitest'
import { bookingTimeRange } from './bookingTimeRange'

describe('bookingTimeRange', () => {
  it('uses earliest start and latest end across hours', () => {
    expect(bookingTimeRange([
      { startTime: '19:00', endTime: '20:00' },
      { startTime: '18:00', endTime: '19:00' },
    ])).toEqual({ startTime: '18:00', endTime: '20:00' })
  })

  it('falls back to start when end is missing', () => {
    expect(bookingTimeRange([{ startTime: '18:00' }])).toEqual({
      startTime: '18:00',
      endTime: '18:00',
    })
  })
})
