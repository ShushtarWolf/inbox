import { toPersianDigits } from '#shared/jalali.ts'

export function useFormatters() {
  const { locale, t } = useI18n()

  function intlLocale() {
    return locale.value === 'fa' ? 'fa-IR' : 'en-US'
  }

  function faDateOptions(extra: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormatOptions {
    if (locale.value !== 'fa') return extra
    return { calendar: 'persian', numberingSystem: 'arabext', ...extra }
  }

  function toDate(value: string | number | Date) {
    if (value instanceof Date) return value
    const normalized = typeof value === 'string' && !value.includes('T') ? `${value}T12:00:00` : value
    return new Date(normalized)
  }

  function formatNumber(value: number | string | null | undefined) {
    const numeric = typeof value === 'number' ? value : Number(value ?? 0)
    return new Intl.NumberFormat(intlLocale()).format(numeric)
  }

  /** Calendar years — Persian digits only, never thousand separators (unlike formatNumber). */
  function formatYear(value: number | string | null | undefined) {
    const numeric = typeof value === 'number' ? value : Number(value ?? 0)
    if (!Number.isFinite(numeric)) return ''
    const year = String(Math.trunc(numeric))
    return locale.value === 'fa' ? toPersianDigits(year) : year
  }

  function formatCurrency(value: number | string | null | undefined) {
    return `${formatNumber(value)} ${t('common.currency')}`
  }

  function formatDate(value: string | number | Date) {
    return new Intl.DateTimeFormat(intlLocale(), faDateOptions({
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })).format(toDate(value))
  }

  function formatIsoDate(iso: string) {
    if (!iso) return ''
    return formatDate(iso)
  }

  function formatDayNumber(value: string | number | Date) {
    const date = toDate(value)
    if (locale.value === 'fa') {
      return new Intl.DateTimeFormat(intlLocale(), faDateOptions({ day: 'numeric' })).format(date)
    }
    return formatNumber(date.getDate())
  }

  function formatWeekday(value: string | number | Date, style: 'short' | 'long' = 'short') {
    return new Intl.DateTimeFormat(intlLocale(), faDateOptions({ weekday: style })).format(toDate(value))
  }

  function formatMonth(value: string | number | Date, style: 'short' | 'long' = 'long') {
    return new Intl.DateTimeFormat(intlLocale(), faDateOptions({ month: style })).format(toDate(value))
  }

  function formatTimeLabel(value: string) {
    const label = (value || '').trim().slice(0, 5)
    return locale.value === 'fa' ? toPersianDigits(label) : label
  }

  function formatTimeRange(start: string, end?: string | null) {
    if (!end) return formatTimeLabel(start)
    return `${formatTimeLabel(start)} – ${formatTimeLabel(end)}`
  }

  function formatDateTime(value: string | number | Date) {
    return new Intl.DateTimeFormat(intlLocale(), faDateOptions({
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })).format(toDate(value))
  }

  /** Any display string that may contain Latin digits (court names, codes, etc.). */
  function formatFaDigits(value: string | number | null | undefined) {
    if (value == null || value === '') return ''
    const text = String(value)
    return locale.value === 'fa' ? toPersianDigits(text) : text
  }

  /** Display phones with Persian digits; keep tel: hrefs in Latin ASCII. */
  function formatPhone(value: string | null | undefined) {
    if (!value) return ''
    return formatFaDigits(value)
  }

  function formatHours(count: number | string | null | undefined) {
    return t('common.hoursShort', { count: formatNumber(count) })
  }

  function formatDistanceKm(value: number | string | null | undefined) {
    return t('common.distanceKm', { count: formatNumber(value) })
  }

  return {
    formatNumber,
    formatYear,
    formatCurrency,
    formatDate,
    formatIsoDate,
    formatDayNumber,
    formatWeekday,
    formatMonth,
    formatTimeLabel,
    formatTimeRange,
    formatDateTime,
    formatFaDigits,
    formatPhone,
    formatHours,
    formatDistanceKm,
  }
}
