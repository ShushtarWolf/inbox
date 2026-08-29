const FARSI_CHARS = /[\u0600-\u06FF]/

const SLOT_CONFLICT_MESSAGES = new Set([
  'Slot not available',
  'SLOT_IN_PAST',
  'HOLD_EXPIRED',
  'This session time is already booked',
])

export function isSlotConflictError(error: unknown) {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    if (statusCode === 409) return true
  }
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { statusMessage?: string; statusCode?: number } }).data
    if (data?.statusCode === 409) return true
    if (data?.statusMessage && SLOT_CONFLICT_MESSAGES.has(data.statusMessage)) return true
  }
  return false
}

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
    HOLD_EXPIRED: 'booking.errors.holdExpired',
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
    'Insufficient withdrawable balance': 'athlete.withdrawInsufficient',
    'SHEBA is required before withdraw': 'athlete.withdrawNeedSheba',
    'Invalid SHEBA': 'athlete.shebaInvalid',
    'image must be a valid URL': 'owner.settingsPage.errors.imageInvalid',
    'nameFa is required': 'owner.settingsPage.errors.nameFaRequired',
    'nameEn is required': 'owner.settingsPage.errors.nameEnRequired',
    'addressFa is required': 'owner.settingsPage.errors.addressFaRequired',
    'addressEn is required': 'owner.settingsPage.errors.addressEnRequired',
    'city is required': 'owner.settingsPage.errors.cityRequired',
    'openHour must be before closeHour': 'owner.settingsPage.errors.openBeforeClose',
    'openHour must be a non-negative number': 'owner.settingsPage.errors.hourInvalid',
    'closeHour must be a non-negative number': 'owner.settingsPage.errors.hourInvalid',
    'cancellationWindowHours must be a non-negative number': 'owner.settingsPage.errors.hourInvalid',
    'rescheduleWindowHours must be a non-negative number': 'owner.settingsPage.errors.hourInvalid',
    'defaultSessionDurationMinutes must be positive': 'owner.settingsPage.errors.durationInvalid',
    'Invalid sport': 'owner.settingsPage.errors.sportInvalid',
    'Invalid court count': 'owner.settingsPage.errors.courtCountInvalid',
    'At least one permission is required': 'owner.settingsPage.errors.permissionRequired',
    'Invalid permission': 'owner.settingsPage.errors.permissionInvalid',
    'Withdraw amount must be positive': 'athlete.withdrawInvalidAmount',
    'Package not found': 'booking.errors.packageNotFound',
    'Package is full': 'booking.packageFull',
    PACKAGE_CONFLICT: 'owner.packagesPage.conflictsTitle',
    PACKAGE_SCHEDULE_INCOMPLETE: 'owner.packagesPage.errorIncomplete',
    PACKAGE_NO_SESSIONS: 'owner.packagesPage.errorIncomplete',
    PACKAGE_ALREADY_BOOKED: 'booking.errors.packageAlreadyBooked',
    PACKAGE_CANCELLED: 'owner.packagesPage.status.CANCELLED',
    PACKAGES_DISABLED: 'owner.packagesDisabled.title',
    'courtId required': 'owner.packagesPage.courtPlaceholder',
    'Invalid waitlist request': 'booking.errors.waitlistInvalid',
    'Waitlist is not available': 'booking.errors.waitlistUnavailable',
    'Invalid credentials': 'auth.invalidCredentials',
    'Invalid OTP': 'auth.invalidOtp',
    'Invalid phone': 'auth.invalidPhone',
    'Phone already registered': 'auth.phoneTaken',
    'Invalid or expired token': 'auth.resetFailed',
    'Invalid ticket body': 'contact.messageNeedBody',
    'Invalid email': 'contact.messageEmailInvalid',
    'errors.rateLimited': 'errors.rateLimited',
    'COACH_PRIMARY_CLUB_NOT_ACTIVE': 'coach.primaryClubMustBeActive',
    'COACH_NOT_APPROVED': 'coach.book.errorNotApproved',
    'COACH_REJECTED': 'coach.clubLinkRejected',
    'COACH_CLUB_LINK_BLOCKED': 'coach.clubLinkBlocked',
    COMPETITION_FULL: 'competitions.errors.full',
    COMPETITION_NOT_JOINABLE: 'competitions.errors.notJoinable',
    COMPETITION_CANCELLED: 'competitions.errors.notJoinable',
    ALREADY_REGISTERED: 'competitions.errors.alreadyRegistered',
    PAY_AT_CLUB_NOT_ALLOWED: 'competitions.errors.payAtClubNotAllowed',
    CANCELLATION_WINDOW_PASSED: 'competitions.errors.cancellationWindowPassed',
    COMPETITION_JOIN_RATE_LIMITED: 'competitions.errors.rateLimited',
    PARTNER_NOT_REGISTERED: 'competitions.errors.partnerNotRegistered',
    PARTNER_PHONE_INVALID: 'competitions.errors.partnerPhoneInvalid',
    ENTRY_FEE_TOO_HIGH: 'owner.competitionsPage.errorEntryFeeTooHigh',
    'Account disabled': 'auth.accountDisabled',
    USER_ROLE_SLOT_FULL: 'owner.inviteRoleSlotFull',
    'Coach product is disabled in pilot mode': 'auth.coachDisabledInPilot',
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
