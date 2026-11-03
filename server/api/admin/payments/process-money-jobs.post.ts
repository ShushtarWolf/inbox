import { requireAdminSecret } from '../../../utils/adminAuth'
import {
  processPendingMoneyJobs,
  reconcilePaidPaymentsMissingLedger,
  requeueFailedMoneyJobs,
} from '../../../utils/moneyJobs'

/** Cron/admin: retry SETTLE / TOPUP_CREDIT for PAID payments (~5 min cadence). */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const body = await readBody<{ reconcile?: boolean; requeueFailed?: boolean }>(event).catch(() => ({}))
  if (body?.requeueFailed) {
    const requeued = await requeueFailedMoneyJobs()
    return { ...requeued, ...(await processPendingMoneyJobs()) }
  }
  if (body?.reconcile !== false) {
    return reconcilePaidPaymentsMissingLedger()
  }
  return processPendingMoneyJobs()
})
