import { describe, expect, it } from 'vitest'
import { fetchErrorMessage, isSlotConflictError } from './useFetchError.ts'

function t(key: string) {
  return `i18n:${key}`
}

function err(statusMessage: string) {
  return { data: { statusMessage } }
}

describe('fetchErrorMessage settings PATCH', () => {
  it('maps club settings failures to Farsi keys instead of a generic fallback', () => {
    expect(fetchErrorMessage(err('Invalid SHEBA'), 'مشکلی پیش آمد', t)).toBe('i18n:athlete.shebaInvalid')
    expect(fetchErrorMessage(err('image must be a valid URL'), 'مشکلی پیش آمد', t))
      .toBe('i18n:owner.settingsPage.errors.imageInvalid')
    expect(fetchErrorMessage(err('nameFa is required'), 'مشکلی پیش آمد', t))
      .toBe('i18n:owner.settingsPage.errors.nameFaRequired')
    expect(fetchErrorMessage(err('openHour must be before closeHour'), 'مشکلی پیش آمد', t))
      .toBe('i18n:owner.settingsPage.errors.openBeforeClose')
  })

  it('keeps the fallback for unmapped English server messages', () => {
    expect(fetchErrorMessage(err('Some unknown failure'), 'مشکلی پیش آمد', t))
      .toBe('مشکلی پیش آمد')
  })

  it('maps profile phone conflicts', () => {
    expect(fetchErrorMessage(err('Invalid phone'), 'مشکلی پیش آمد', t)).toBe('i18n:auth.invalidPhone')
    expect(fetchErrorMessage(err('Phone already registered'), 'مشکلی پیش آمد', t)).toBe('i18n:auth.phoneTaken')
  })
})

describe('fetchErrorMessage desk reserve conflicts', () => {
  it('maps past and taken slot 409s to booking error keys', () => {
    expect(fetchErrorMessage(err('SLOT_IN_PAST'), 'مشکلی پیش آمد', t))
      .toBe('i18n:booking.errors.slotInPast')
    expect(fetchErrorMessage(err('Slot not available'), 'مشکلی پیش آمد', t))
      .toBe('i18n:booking.errors.slotNotAvailable')
    expect(fetchErrorMessage(err('This session time is already booked'), 'مشکلی پیش آمد', t))
      .toBe('i18n:booking.errors.sessionTaken')
  })
})

describe('isSlotConflictError', () => {
  it('detects 409 status and known slot conflict messages', () => {
    expect(isSlotConflictError({ statusCode: 409 })).toBe(true)
    expect(isSlotConflictError({ data: { statusMessage: 'Slot not available' } })).toBe(true)
    expect(isSlotConflictError({ data: { statusMessage: 'Invalid credentials' } })).toBe(false)
  })
})
