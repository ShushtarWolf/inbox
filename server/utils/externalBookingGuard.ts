import type {
  ExternalBookingClub,
  ExternalBookingSlot,
} from '../../modules/inbox-external-calendar/runtime/server/lib/bookingGuard'

/**
 * Booking-time external guard — no-op when the calendar module is not registered.
 */
export async function assertExternalBookingAllowedIfEnabled(opts: {
  club: ExternalBookingClub
  slots: ExternalBookingSlot[]
}): Promise<void> {
  const config = useRuntimeConfig()
  if (!config.public.externalCalendarModule) return

  const { assertExternalBookingAllowed } = await import(
    '../../modules/inbox-external-calendar/runtime/server/lib/bookingGuard'
  )
  await assertExternalBookingAllowed(opts)
}
