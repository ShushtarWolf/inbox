import { ATHLETE_CANNOT_CONFIRM_CASH, athleteAttemptedDeskCashConfirm } from '#shared/deskPaidGuard.ts'

/** Athletes must never confirm or select desk cash. Owner/staff desk APIs are the only cash-paid path. */
export function assertAthleteDidNotConfirmCash(body: unknown) {
  const payload = body && typeof body === 'object'
    ? body as { paymentMethod?: unknown; paymentStatus?: unknown; method?: unknown; status?: unknown }
    : null
  if (athleteAttemptedDeskCashConfirm(payload)) {
    throw createError({
      statusCode: 403,
      statusMessage: ATHLETE_CANNOT_CONFIRM_CASH,
    })
  }
}
