import { describe, expect, it } from 'vitest'
import { coachStudentQuery, mergeCoachStudentHits } from './coachStudentSearch'

describe('coachStudentQuery', () => {
  it('ignores queries shorter than 2 characters', () => {
    expect(coachStudentQuery('')).toBeNull()
    expect(coachStudentQuery(' آ ')).toBeNull()
  })

  it('turns Persian digits into an exact mobile and a contains hint', () => {
    expect(coachStudentQuery('۰۹۱۲۳۴۵۶۷۸۹')).toEqual({
      q: '09123456789',
      phoneContains: '9123456789',
      exactPhone: '09123456789',
    })
  })

  it('keeps a short prefix that would become too broad without the leading zero', () => {
    expect(coachStudentQuery('091')?.phoneContains).toBe('091')
  })
})

describe('mergeCoachStudentHits', () => {
  it('dedupes the same phone and still appends a student the coach has not taught', () => {
    const hits = mergeCoachStudentHits(
      [
        { name: 'آویده ربیعی', mobile: '09120000000' },
        { name: '', mobile: '09120000000' },
      ],
      { name: 'مهمان تازه', mobile: '09121111111' },
    )
    expect(hits).toEqual([
      { name: 'آویده ربیعی', mobile: '09120000000' },
      { name: 'مهمان تازه', mobile: '09121111111' },
    ])
  })

  it('drops empty rows and keeps the first twelve', () => {
    const past = Array.from({ length: 13 }, (_, i) => ({
      name: `شاگرد ${i}`,
      mobile: `091200000${String(i).padStart(2, '0')}`.slice(0, 11),
    }))
    const hits = mergeCoachStudentHits([{ name: '', mobile: '' }, ...past], null)
    expect(hits).toHaveLength(12)
    expect(hits[0]?.name).toBe('شاگرد 0')
  })
})
