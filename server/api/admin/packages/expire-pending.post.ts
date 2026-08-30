import { requireAdminSecret } from '../../../utils/adminAuth'
import { expireStalePendingPackageBookings } from '../../../utils/packages'

/** Cron/admin: expire unpaid online PENDING package seats (~10 min). */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const result = await expireStalePendingPackageBookings()
  return result
})
