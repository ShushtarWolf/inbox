import { jalaaliMonthLength, toGregorian, toJalaali } from 'jalaali-js'

export const PERSIAN_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const

export function parseGregorianIso(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

export function gregorianToIso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isoToJalaali(iso: string) {
  const { year, month, day } = parseGregorianIso(iso)
  return toJalaali(year, month, day)
}

export function jalaaliToIso(jy: number, jm: number, jd: number) {
  const { gy, gm, gd } = toGregorian(jy, jm, jd)
  return gregorianToIso(gy, gm, gd)
}

export function jalaaliDaysInMonth(jy: number, jm: number) {
  return jalaaliMonthLength(jy, jm)
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** Latin digits → Persian (extended Arabic-Indic) digits. Leaves other characters unchanged. */
export function toPersianDigits(value: string) {
  return value.replace(/\d/g, (d) => FA_DIGITS[Number(d)] ?? d)
}

/** SMS date: ISO YYYY-MM-DD → Jalali ۱۴۰۴/۰۵/۲۳; other dates just get Persian digits. */
export function formatSmsJalaliDate(raw: string) {
  const value = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const { jy, jm, jd } = isoToJalaali(value)
    return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`)
  }
  return toPersianDigits(value.replace(/-/g, '/'))
}

export function formatSmsTime(raw: string) {
  return toPersianDigits(raw.trim().slice(0, 5))
}
