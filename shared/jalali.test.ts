import { describe, expect, it } from 'vitest'
import {
  formatSmsJalaliDate,
  formatSmsJalaliLongDate,
  formatSmsTime,
  gregorianToIso,
  isoToJalaali,
  jalaaliDaysInMonth,
  jalaaliToIso,
  parseGregorianIso,
  toPersianDigits,
} from './jalali'

describe('parseGregorianIso', () => {
  it('parses ISO date parts', () => {
    expect(parseGregorianIso('2026-03-21')).toEqual({ year: 2026, month: 3, day: 21 })
  })
})

describe('gregorianToIso', () => {
  it('zero-pads month and day', () => {
    expect(gregorianToIso(2026, 3, 5)).toBe('2026-03-05')
  })
})

describe('jalali conversions', () => {
  it('converts Nowruz 1405 to Gregorian', () => {
    expect(jalaaliToIso(1405, 1, 1)).toBe('2026-03-21')
  })

  it('converts Gregorian to Jalali', () => {
    expect(isoToJalaali('2026-03-21')).toEqual({ jy: 1405, jm: 1, jd: 1 })
  })

  it('formats SMS Jalali date and Persian digits', () => {
    expect(formatSmsJalaliDate('2026-08-14')).toBe('۱۴۰۵/۰۵/۲۳')
    expect(formatSmsJalaliLongDate('2026-08-14')).toBe('۲۳ مرداد ۱۴۰۵')
    expect(formatSmsTime('18:00')).toBe('۱۸:۰۰')
    expect(toPersianDigits('1404/05/23')).toBe('۱۴۰۴/۰۵/۲۳')
  })

  it('round-trips through ISO', () => {
    const iso = '2026-07-11'
    const { jy, jm, jd } = isoToJalaali(iso)
    expect(jalaaliToIso(jy, jm, jd)).toBe(iso)
  })
})

describe('jalaaliDaysInMonth', () => {
  it('returns 31 for first six months', () => {
    expect(jalaaliDaysInMonth(1405, 1)).toBe(31)
    expect(jalaaliDaysInMonth(1405, 6)).toBe(31)
  })

  it('returns 30 for months 7-11', () => {
    expect(jalaaliDaysInMonth(1405, 7)).toBe(30)
    expect(jalaaliDaysInMonth(1405, 11)).toBe(30)
  })
})
