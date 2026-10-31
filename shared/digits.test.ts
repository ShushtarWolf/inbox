import { describe, expect, it } from 'vitest'
import {
  extractAsciiDigits,
  normalizeAsciiDigitInput,
  parseAsciiInt,
  toAsciiDigits,
} from './digits.ts'

describe('toAsciiDigits', () => {
  it('converts Persian and Arabic-Indic digits', () => {
    expect(toAsciiDigits('۰۹۱۲')).toBe('0912')
    expect(toAsciiDigits('١٢٣')).toBe('123')
  })

  it('leaves Latin letters unchanged', () => {
    expect(toAsciiDigits('IR۰۶۰')).toBe('IR060')
  })
})

describe('extractAsciiDigits', () => {
  it('normalizes then strips non-digits', () => {
    expect(extractAsciiDigits('۶۰۰,۰۰۰')).toBe('600000')
    expect(extractAsciiDigits('+98 ۹۱۲')).toBe('98912')
  })
})

describe('parseAsciiInt', () => {
  it('parses Persian digit strings', () => {
    expect(parseAsciiInt('۱۲۰')).toBe(120)
    expect(parseAsciiInt('')).toBeNull()
  })
})

describe('normalizeAsciiDigitInput', () => {
  it('rewrites Persian phone digits to Latin and strips junk', () => {
    expect(normalizeAsciiDigitInput('۰۹۱۲-۳۴۵ ۶۷۸۹')).toBe('09123456789')
  })

  it('caps OTP length', () => {
    expect(normalizeAsciiDigitInput('۱۲۳۴۵۶۷۸', { maxLength: 6 })).toBe('123456')
  })

  it('can keep non-digits when digitsOnly is false', () => {
    expect(normalizeAsciiDigitInput('IR۰۶۰', { digitsOnly: false })).toBe('IR060')
  })
})
