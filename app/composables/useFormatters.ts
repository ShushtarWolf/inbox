export function useFormatters() {
  const { locale, t } = useI18n()

  function formatNumber(value: number | string | null | undefined) {
    const numeric = typeof value === 'number' ? value : Number(value ?? 0)
    return new Intl.NumberFormat(locale.value === 'fa' ? 'fa-IR' : 'en-US').format(numeric)
  }

  function formatCurrency(value: number | string | null | undefined) {
    return `${formatNumber(value)} ${t('common.currency')}`
  }

  function formatDate(value: string | number | Date) {
    const date = value instanceof Date ? value : new Date(value)
    return new Intl.DateTimeFormat(locale.value === 'fa' ? 'fa-IR' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date)
  }

  return { formatNumber, formatCurrency, formatDate }
}
