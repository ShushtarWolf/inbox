export function useLocalizedField() {
  const { locale } = useI18n()

  function localizedField<T extends Record<string, any>>(
    item: T | null | undefined,
    faKey: keyof T,
    enKey: keyof T,
  ) {
    if (!item) return ''
    const preferred = locale.value === 'fa' ? item[faKey] : item[enKey]
    const fallback = locale.value === 'fa' ? item[enKey] : item[faKey]
    return String(preferred ?? fallback ?? '')
  }

  return { localizedField }
}
