import { requireAdminSecret } from '../../../utils/adminAuth'
import { expireStalePendingOnlinePayments } from '../../../utils/paymentSync'

/** Cron/admin: PENDING_ONLINE older than PENDING_ONLINE_EXPIRE_MINUTES → FAILED + split release. */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  return expireStalePendingOnlinePayments()
})
