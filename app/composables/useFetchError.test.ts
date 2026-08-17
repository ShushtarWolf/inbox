import { describe, expect, it } from 'vitest'
import { fetchErrorMessage } from './useFetchError.ts'

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
})
