const FARSI_CHARS = /[\u0600-\u06FF]/

export function fetchErrorMessage(error: unknown, fallback: string, translate?: (key: string) => string) {
  let raw = ''
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { statusMessage?: string } }).data
    if (data?.statusMessage) raw = data.statusMessage
  }
  if (!raw) return fallback

  const errorKeyMap: Record<string, string> = {
    BOOKING_TOO_SOON: 'booking.errors.startTimeTooSoon',
    SLOT_IN_PAST: 'booking.errors.slotInPast',
    DATE_IN_PAST: 'owner.errors.startDateInPast',
    'Slot not available': 'booking.errors.slotNotAvailable',
    'Start time is too soon': 'booking.errors.startTimeTooSoon',
    'Coach is not available at this time': 'booking.errors.coachUnavailable',
    'This session time is already booked': 'booking.errors.sessionTaken',
    'Coach is not bookable': 'booking.errors.coachNotBookable',
    'Coach not found': 'booking.errors.coachNotFound',
    'Online checkout is disabled; pay at the club or use wallet balance': 'booking.checkoutDisabled',
    'Wallet top-up requires online payments mode': 'athlete.walletTopUpRequiresOnline',
    'Invalid top-up amount': 'athlete.walletTopUpInvalidAmountShort',
    'Booking not found': 'booking.errors.bookingNotFound',
    'Court not found': 'booking.errors.courtNotFound',
    'Club not found': 'booking.errors.clubNotFound',
    'Club is not ready for public booking': 'booking.errors.clubNotBookable',
    'Cancellation window has passed': 'booking.errors.cancellationWindowPassed',
    'Insufficient wallet balance': 'booking.errors.insufficientWallet',
    'Package not found': 'booking.errors.packageNotFound',
    'Package is full': 'booking.packageFull',
    'Invalid waitlist request': 'booking.errors.waitlistInvalid',
    'Waitlist is not available': 'booking.errors.waitlistUnavailable',
    'Invalid credentials': 'auth.invalidCredentials',
    'Invalid OTP': 'auth.invalidOtp',
    'Invalid phone': 'auth.invalidPhone',
    'Invalid or expired token': 'auth.resetFailed',
    'Invalid ticket body': 'contact.messageNeedBody',
    'Invalid email': 'contact.messageEmailInvalid',
  }
  const i18nKey = errorKeyMap[raw]
  if (i18nKey && translate) return translate(i18nKey)
  // FA-only product: never surface an untranslated (English) server message.
  return FARSI_CHARS.test(raw) ? raw : fallback
}

export function useFetchError() {
  const { t } = useI18n()
  return {
    fetchErrorMessage: (error: unknown, fallback: string) => fetchErrorMessage(error, fallback, t),
  }
}
