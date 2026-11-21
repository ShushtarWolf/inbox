import { describe, expect, it } from 'vitest'
import {
  COURT_DESCRIPTION_MAX,
  normalizeCourtDescription,
  parseCourtDescriptionInput,
} from './courtDescription.ts'

describe('normalizeCourtDescription', () => {
  it('trims and returns null for empty', () => {
    expect(normalizeCourtDescription('  ')).toBeNull()
    expect(normalizeCourtDescription(null)).toBeNull()
    expect(normalizeCourtDescription(undefined)).toBeNull()
  })

  it('preserves inner newlines', () => {
    expect(normalizeCourtDescription('خط اول\nخط دوم')).toBe('خط اول\nخط دوم')
  })

  it('rejects non-strings and over-max length', () => {
    expect(() => normalizeCourtDescription(1)).toThrow('Invalid')
    expect(() => normalizeCourtDescription('x'.repeat(COURT_DESCRIPTION_MAX + 1))).toThrow('too long')
  })
})

describe('parseCourtDescriptionInput', () => {
  it('maps client validation errors', () => {
    expect(parseCourtDescriptionInput(' ok ')).toEqual({ ok: true, value: 'ok' })
    expect(parseCourtDescriptionInput('')).toEqual({ ok: true, value: null })
    expect(parseCourtDescriptionInput({})).toEqual({ ok: false, error: 'invalid' })
    expect(parseCourtDescriptionInput('x'.repeat(COURT_DESCRIPTION_MAX + 1))).toEqual({ ok: false, error: 'too_long' })
  })
})