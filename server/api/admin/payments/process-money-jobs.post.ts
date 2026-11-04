import { requireAdminSecret } from '../../../utils/adminAuth'
import { healReversedStillPaidPayments } from '../../../utils/healReversedStillPaid'
import {
  processPendingMoneyJobs,
  reconcilePaidPaymentsMissingLedger,
  requeueFailedMoneyJobs,
} from '../../../utils/moneyJobs'

/** Cron/admin: retry SETTLE / TOPUP_CREDIT for PAID payments (~5 min cadence). */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const body = await readBody<{
    reconcile?: boolean
    requeueFailed?: boolean
    healReversed?: boolean
  }>(event).catch(() => ({}))
  if (body?.requeueFailed) {
    const requeued = await requeueFailedMoneyJobs()
    return { ...requeued, ...(await processPendingMoneyJobs()) }
  }
  const heal = body?.healReversed !== false
    ? await healReversedStillPaidPayments()
    : { scanned: 0, healed: 0, results: [] as const }
  if (body?.reconcile !== false) {
    return { heal, ...(await reconcilePaidPaymentsMissingLedger()) }
  }
  return { heal, ...(await processPendingMoneyJobs()) }
})
