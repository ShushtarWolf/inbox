export function useFormatters() {
  const { locale, t } = useI18n()

  function intlLocale() {
    return locale.value === 'fa' ? 'fa-IR' : 'en-US'
  }

  function formatNumber(value: number | string | null | undefined) {
    const numeric = typeof value === 'number' ? value : Number(value ?? 0)
    return new Intl.NumberFormat(intlLocale()).format(numeric)
  }

  function formatCurrency(value: number | string | null | undefined) {
    return `${formatNumber(value)} ${t('common.currency')}`
  }

  function formatDate(value: string | number | Date) {
    const date = value instanceof Date ? value : new Date(value)
    return new Intl.DateTimeFormat(intlLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date)
  }

  function formatWeekday(value: string | number | Date, style: 'short' | 'long' = 'short') {
    const date = value instanceof Date ? value : new Date(value)
    return new Intl.DateTimeFormat(intlLocale(), { weekday: style }).format(date)
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
    formatWeekday,
    formatTimeLabel,
    formatTimeRange,
    formatHours,
    formatDistanceKm,
  }
}
