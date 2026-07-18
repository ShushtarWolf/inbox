import { describe, expect, it } from 'vitest'
import { renderEmailTemplate } from '../server/utils/emailTemplates'

describe('renderEmailTemplate', () => {
  it('renders password reset', () => {
    const result = renderEmailTemplate('PASSWORD_RESET', { resetUrl: 'https://example.com/reset' })
    expect(result.subject).toContain('password')
    expect(result.text).toContain('https://example.com/reset')
  })

  it('renders booking confirmed', () => {
    const result = renderEmailTemplate('BOOKING_CONFIRMED', {
      clubName: 'Padel Zone',
      date: '2026-07-11',
      startTime: '10:00',
      kind: 'court',
    })
    expect(result.subject).toContain('Padel Zone')
    expect(result.text).toContain('2026-07-11')
  })

  it('renders booking cancelled', () => {
    const result = renderEmailTemplate('BOOKING_CANCELLED', {
      clubName: 'Padel Zone',
      date: '2026-07-11',
      startTime: '10:00',
      kind: 'court',
    })
    expect(result.subject).toContain('cancelled')
    expect(result.text).toContain('Padel Zone')
  })

  it('renders booking paid', () => {
    const result = renderEmailTemplate('BOOKING_PAID', {
      clubName: 'Padel Zone',
      date: '2026-07-11',
      startTime: '10:00',
      kind: 'court',
    })
    expect(result.subject).toContain('Payment')
    expect(result.text).toContain('marked paid')
  })

  it('renders club approved with temp password', () => {
    const result = renderEmailTemplate('CLUB_APPROVED', {
      clubName: 'My Club',
      loginUrl: 'https://example.com/login',
      tempPassword: 'abc123',
    })
    expect(result.text).toContain('abc123')
    expect(result.text).toContain('My Club')
  })
})
