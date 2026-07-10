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
    return value.slice(0, 5)
  }

  function formatTimeRange(start: string, end?: string | null) {
    if (!end) return formatTimeLabel(start)
    return `${formatTimeLabel(start)} – ${formatTimeLabel(end)}`
  }

  function formatHours(count: number | string | null | undefined) {
    return t('common.hoursShort', { count: formatNumber(count) })
  }

  function formatDistanceKm(value: number | string | null | undefined) {
    return t('common.distanceKm', { count: formatNumber(value) })
  }

  return {
    formatNumber,
    formatCurrency,
    formatDate,
    formatIsoDate,
    formatDayNumber,
    formatWeekday,
    formatMonth,
    formatTimeLabel,
    formatTimeRange,
    formatHours,
    formatDistanceKm,
  }
}
