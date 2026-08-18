import { processDailyOwnerReservationReminders } from '../../../utils/sms/dailyOwnerReminders'

/**
 * Cron / admin entry: one short SMS per club with same-day court reservations
 * (calendar URL; no booking list). Empty days are skipped.
 * Auth: x-admin-secret (same as process-scheduled).
 * There is no in-app worker — Liara dashboard cron or the /admin/sms button must call this.
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
