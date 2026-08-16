import { processDailyOwnerReservationReminders } from '../../../utils/sms/dailyOwnerReminders'

/**
 * Cron entry: SMS club owners a same-day court reservation list.
 * Only clubs with ≥1 non-cancelled booking for the date receive a message.
 * Auth: x-admin-secret (same as process-scheduled).
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  await enforceRateLimit(event, 'admin:sms-daily-owner')
  const query = getQuery(event)
  const dateRaw = typeof query.date === 'string' ? query.date.trim() : ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : undefined
  const result = await processDailyOwnerReservationReminders({ date })
  return { ok: true, ...result }
})
