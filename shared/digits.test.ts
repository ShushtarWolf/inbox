import { describe, expect, it } from 'vitest'
import { extractAsciiDigits, parseAsciiInt, toAsciiDigits } from './digits.ts'

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
