import { describe, expect, it } from 'vitest'
import {
  formatUserDisplayName,
  normalizeUserNamePair,
  resolveUserDisplayName,
  splitStoredFullName,
  userNameFieldsFromParts,
  userToGuestNamePair,
} from './userName'

describe('splitStoredFullName (backfill default)', () => {
  it('keeps a single token in name with empty family', () => {
    expect(splitStoredFullName('بهناز')).toEqual({ name: 'بهناز', nameFamily: '' })
    expect(splitStoredFullName('  علی  ')).toEqual({ name: 'علی', nameFamily: '' })
  })

  it('splits on first space: first token = نام, rest = نام‌خانوادگی', () => {
    expect(splitStoredFullName('علی محمدی')).toEqual({ name: 'علی', nameFamily: 'محمدی' })
    expect(splitStoredFullName('سید حمید رضا افقه')).toEqual({
      name: 'سید',
      nameFamily: 'حمید رضا افقه',
    })
  })

  it('returns empty for blank input', () => {
    expect(splitStoredFullName('')).toEqual({ name: '', nameFamily: '' })
    expect(splitStoredFullName('   ')).toEqual({ name: '', nameFamily: '' })
  })
})

describe('formatUserDisplayName', () => {
  it('shows legacy full name when family is empty', () => {
    expect(formatUserDisplayName('بهناز تعبدی', null)).toBe('بهناز تعبدی')
  })

  it('joins split parts', () => {
    expect(formatUserDisplayName('علی', 'محمدی')).toBe('علی محمدی')
  })
})

describe('normalizeUserNamePair', () => {
  it('dedupes like guest desk fields', () => {
    expect(normalizeUserNamePair('علی', 'محمدی')).toEqual({ name: 'علی', nameFamily: 'محمدی' })
    expect(normalizeUserNamePair('بهناز تعبدی', 'تعبدی')).toEqual({
      name: 'بهناز تعبدی',
      nameFamily: '',
    })
  })
})

describe('resolveUserDisplayName', () => {
  it('prefers Persian parts over nameEn', () => {
    expect(resolveUserDisplayName({ name: 'علی', nameFamily: 'رضایی', nameEn: 'Ali' })).toBe('علی رضایی')
  })

  it('falls back to nameEn then bare name', () => {
    expect(resolveUserDisplayName({ name: '', nameFamily: '', nameEn: 'Pat' })).toBe('Pat')
    expect(resolveUserDisplayName({ name: 'تنها', nameFamily: null, nameEn: null })).toBe('تنها')
  })
})

describe('userToGuestNamePair', () => {
  it('maps user fields to booking guest columns', () => {
    expect(userToGuestNamePair({ name: 'علی', nameFamily: 'محمدی' })).toEqual({
      guestName: 'علی',
      guestFamily: 'محمدی',
    })
  })
})

describe('userNameFieldsFromParts', () => {
  it('sets nameEn to formatted display', () => {
    expect(userNameFieldsFromParts('علی', 'محمدی')).toEqual({
      name: 'علی',
      nameFamily: 'محمدی',
      nameEn: 'علی محمدی',
    })
  })
})
