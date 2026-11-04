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
  // Heal must never block settle/top-up retries (cron sends reconcile:true every 5m).
  let heal: Awaited<ReturnType<typeof healReversedStillPaidPayments>> | {
    scanned: number
    healed: number
    results: Array<{ paymentId: string, ok: boolean, reason: string }>
    error?: string
  } = { scanned: 0, healed: 0, results: [] }
  if (body?.healReversed !== false) {
    try {
      heal = await healReversedStillPaidPayments()
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[process-money-jobs:heal]', err)
      heal = { scanned: 0, healed: 0, results: [], error: message.slice(0, 300) }
    }
  }
  if (body?.reconcile !== false) {
    return { heal, ...(await reconcilePaidPaymentsMissingLedger()) }
  }
  return { heal, ...(await processPendingMoneyJobs()) }
})
