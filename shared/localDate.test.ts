import { describe, expect, it } from 'vitest'
import { localDateString } from './localDate'

describe('localDateString', () => {
  it('formats YYYY-MM-DD in Asia/Tehran', () => {
    const date = new Date('2026-03-20T20:30:00Z')
    expect(localDateString(date, 'Asia/Tehran')).toBe('2026-03-21')
  })

  it('formats in UTC timezone', () => {
    const date = new Date('2026-03-21T12:00:00Z')
    expect(localDateString(date, 'UTC')).toBe('2026-03-21')
  })
})
