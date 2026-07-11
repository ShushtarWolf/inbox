import { describe, expect, it, vi } from 'vitest'
import { translateCoachSpecialty } from './coachSpecialty'

describe('translateCoachSpecialty', () => {
  it('returns translated label when key exists', () => {
    const t = vi.fn((key: string) => (key === 'coaches.specialtyOptions.Footwork' ? 'فوت‌ورک' : key))
    expect(translateCoachSpecialty(t, 'Footwork')).toBe('فوت‌ورک')
  })

  it('falls back to raw value when key is missing', () => {
    const t = vi.fn((key: string) => key)
    expect(translateCoachSpecialty(t, 'Custom skill')).toBe('Custom skill')
  })
})
