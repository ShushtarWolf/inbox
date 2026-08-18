import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatGuestDisplayName, normalizeGuestNamePair } from './guestName'

describe('formatGuestDisplayName', () => {
  it('shows a full first name once when family is empty', () => {
    expect(formatGuestDisplayName('بهناز تعبدی', null)).toBe('بهناز تعبدی')
    expect(formatGuestDisplayName('بهناز تعبدی', '')).toBe('بهناز تعبدی')
  })

  it('shows once when both fields are equal', () => {
    expect(formatGuestDisplayName('بهناز تعبدی', 'بهناز تعبدی')).toBe('بهناز تعبدی')
  })

  it('joins distinct first and family', () => {
    expect(formatGuestDisplayName('علی', 'محمدی')).toBe('علی محمدی')
  })

  it('joins a multi-word first name with a distinct family once', () => {
    expect(formatGuestDisplayName('سید حمید رضا', 'افقه')).toBe('سید حمید رضا افقه')
  })

  it('returns empty when both parts are empty', () => {
    expect(formatGuestDisplayName('', '')).toBe('')
    expect(formatGuestDisplayName(null, undefined)).toBe('')
  })
})

describe('normalizeGuestNamePair', () => {
  it('keeps a full name in first and leaves family empty', () => {
    expect(normalizeGuestNamePair('بهناز تعبدی', null)).toEqual({
      guestName: 'بهناز تعبدی',
      guestFamily: '',
    })
  })

  it('clears family when it duplicates first', () => {
    expect(normalizeGuestNamePair('بهناز تعبدی', 'بهناز تعبدی')).toEqual({
      guestName: 'بهناز تعبدی',
      guestFamily: '',
    })
  })

  it('keeps a distinct two-part name', () => {
    expect(normalizeGuestNamePair('علی', 'محمدی')).toEqual({
      guestName: 'علی',
      guestFamily: 'محمدی',
    })
    expect(normalizeGuestNamePair('سید حمید رضا', 'افقه')).toEqual({
      guestName: 'سید حمید رضا',
      guestFamily: 'افقه',
    })
  })

  it('returns empty when both parts are empty', () => {
    expect(normalizeGuestNamePair('', '')).toEqual({ guestName: '', guestFamily: '' })
  })
})

describe('doReserve guest family copy', () => {
  it('no longer copies family from first name', () => {
    const calendarSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../app/pages/owner/calendar.vue'),
      'utf8',
    )
    expect(calendarSrc).not.toMatch(/guestFamily\s*=\s*form\.guestName/)
  })
})
