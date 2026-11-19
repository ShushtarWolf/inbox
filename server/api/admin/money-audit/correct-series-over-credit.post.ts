import { correctSeriesOverCredit } from '../../../utils/correctSeriesOverCredit'
import { runMoneyAuditAndAlert } from '../../../utils/moneyAudit'

/**
 * Phase F: reviewed series over-credit ADJUSTMENT.
 * Dry-run by default. `?apply=1&paymentId=…` debits athlete + credits club.
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const apply = query.apply === '1' || query.apply === 'true'
  const paymentId = String(query.paymentId || '').trim()
  if (!paymentId) {
    throw createError({ statusCode: 400, statusMessage: 'paymentId required' })
  }
  const correction = await correctSeriesOverCredit({ paymentId, apply })
  const audit = await runMoneyAuditAndAlert({ notify: false })
  return { correction, audit }
})
