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
