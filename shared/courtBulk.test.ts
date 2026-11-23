import { describe, expect, it } from 'vitest'
import {
  COURT_BULK_MAX,
  numberedCourtNames,
  parseCourtBulkCount,
  toFaDigits,
} from './courtBulk.ts'

describe('parseCourtBulkCount', () => {
  it('defaults empty to 1', () => {
    expect(parseCourtBulkCount(undefined)).toBe(1)
    expect(parseCourtBulkCount(null)).toBe(1)
    expect(parseCourtBulkCount('')).toBe(1)
  })

  it('accepts integers in range', () => {
    expect(parseCourtBulkCount(1)).toBe(1)
    expect(parseCourtBulkCount(8)).toBe(8)
    expect(parseCourtBulkCount(String(COURT_BULK_MAX))).toBe(COURT_BULK_MAX)
  })

  it('rejects out of range and non-integers', () => {
    expect(() => parseCourtBulkCount(0)).toThrow('Invalid court count')
    expect(() => parseCourtBulkCount(COURT_BULK_MAX + 1)).toThrow('Invalid court count')
    expect(() => parseCourtBulkCount(1.5)).toThrow('Invalid court count')
    expect(() => parseCourtBulkCount('abc')).toThrow('Invalid court count')
  })
})

describe('numberedCourtNames', () => {
  it('keeps a single court name as entered', () => {
    expect(numberedCourtNames({ nameFa: 'زمین پدل', nameEn: 'Padel', index: 1, total: 1 })).toEqual({
      nameFa: 'زمین پدل',
      nameEn: 'Padel',
    })
  })

  it('uses legacy defaults for a single unnamed court', () => {
    expect(numberedCourtNames({ index: 1, total: 1 })).toEqual({
      nameFa: 'زمین جدید',
      nameEn: 'New court',
    })
  })

  it('appends Persian and Latin indexes for a batch', () => {
    expect(numberedCourtNames({ nameFa: 'زمین پدل', nameEn: 'Padel', index: 2, total: 4 })).toEqual({
      nameFa: `زمین پدل ${toFaDigits(2)}`,
      nameEn: 'Padel 2',
    })
  })

  it('numbers empty batch names from زمین / Court', () => {
    expect(numberedCourtNames({ index: 1, total: 3 })).toEqual({
      nameFa: `زمین ${toFaDigits(1)}`,
      nameEn: 'Court 1',
    })
  })

  it('increments when the base name already ends with a Latin digit', () => {
    expect(numberedCourtNames({ nameEn: 'Court 1', index: 1, total: 3 })).toEqual({
      nameFa: `زمین ${toFaDigits(1)}`,
      nameEn: 'Court 1',
    })
    expect(numberedCourtNames({ nameEn: 'Court 1', index: 2, total: 3 })).toEqual({
      nameFa: `زمین ${toFaDigits(2)}`,
      nameEn: 'Court 2',
    })
    expect(numberedCourtNames({ nameEn: 'Court 1', index: 3, total: 3 })).toEqual({
      nameFa: `زمین ${toFaDigits(3)}`,
      nameEn: 'Court 3',
    })
  })

  it('increments when the base name already ends with a Persian digit', () => {
    expect(numberedCourtNames({ nameFa: 'زمین ۱', nameEn: 'Court 1', index: 1, total: 3 })).toEqual({
      nameFa: 'زمین ۱',
      nameEn: 'Court 1',
    })
    expect(numberedCourtNames({ nameFa: 'زمین ۱', nameEn: 'Court 1', index: 2, total: 3 })).toEqual({
      nameFa: 'زمین ۲',
      nameEn: 'Court 2',
    })
    expect(numberedCourtNames({ nameFa: 'زمین ۱', nameEn: 'Court 1', index: 3, total: 3 })).toEqual({
      nameFa: 'زمین ۳',
      nameEn: 'Court 3',
    })
  })

  it('never concatenates digits into Court 11-style names', () => {
    const names = Array.from({ length: 3 }, (_, i) =>
      numberedCourtNames({ nameFa: 'زمین ۱', nameEn: 'Court 1', index: i + 1, total: 3 }),
    )
    expect(names.map((n) => n.nameEn)).toEqual(['Court 1', 'Court 2', 'Court 3'])
    expect(names.map((n) => n.nameFa)).toEqual(['زمین ۱', 'زمین ۲', 'زمین ۳'])
  })
})
