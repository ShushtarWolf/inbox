export function fetchErrorMessage(error: unknown, fallback: string, translate?: (key: string) => string) {
  let raw = ''
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { statusMessage?: string } }).data
    if (data?.statusMessage) raw = data.statusMessage
  }
  if (!raw) return fallback

  const errorKeyMap: Record<string, string> = {
    BOOKING_TOO_SOON: 'booking.errors.startTimeTooSoon',
    'Start time is too soon': 'booking.errors.startTimeTooSoon',
    'Coach is not available at this time': 'booking.errors.coachUnavailable',
    'This session time is already booked': 'booking.errors.sessionTaken',
    'Coach is not bookable': 'booking.errors.coachNotBookable',
    'Coach not found': 'booking.errors.coachNotFound',
  }
  const i18nKey = errorKeyMap[raw]
  if (i18nKey && translate) return translate(i18nKey)
  return raw
}

export function useFetchError() {
  const { t } = useI18n()
  return {
    fetchErrorMessage: (error: unknown, fallback: string) => fetchErrorMessage(error, fallback, t),
  }
}
