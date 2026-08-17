import { describe, expect, it } from 'vitest'
import { isAllowedClubImageUrl, parseClubImageInput } from './clubImageUrl.ts'

describe('parseClubImageInput', () => {
  it('accepts stored placeholder paths', () => {
    expect(parseClubImageInput('/placeholders/club.svg')).toEqual({
      ok: true,
      value: '/placeholders/club.svg',
    })
    expect(isAllowedClubImageUrl('/placeholders/coach.svg')).toBe(true)
  })

  it('clears image when empty or whitespace', () => {
    expect(parseClubImageInput('')).toEqual({ ok: true, value: null })
    expect(parseClubImageInput('   ')).toEqual({ ok: true, value: null })
    expect(parseClubImageInput(null)).toEqual({ ok: true, value: null })
    expect(parseClubImageInput(undefined)).toEqual({ ok: true, value: null })
  })

  it('rejects invalid schemes', () => {
    expect(parseClubImageInput('ftp://cdn.example/club.jpg')).toEqual({ ok: false })
    expect(parseClubImageInput('javascript:alert(1)')).toEqual({ ok: false })
    expect(parseClubImageInput('file:///etc/passwd')).toEqual({ ok: false })
    expect(parseClubImageInput('club.svg')).toEqual({ ok: false })
  })

  it('still allows http(s), uploads, and demo paths', () => {
    expect(parseClubImageInput('https://cdn.example/club.jpg')).toEqual({
      ok: true,
      value: 'https://cdn.example/club.jpg',
    })
    expect(parseClubImageInput('http://cdn.example/club.jpg').ok).toBe(true)
    expect(parseClubImageInput('/uploads/clubs/a.jpg')).toEqual({
      ok: true,
      value: '/uploads/clubs/a.jpg',
    })
    expect(parseClubImageInput('/demo/clubs/padel-zone-tehran.jpg').ok).toBe(true)
  })
})
