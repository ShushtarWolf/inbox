import { parsePaymentMetadata } from '#shared/cancelRefund.ts'
import { cancelWalletCreditAmount } from '#shared/owedCancelRefund.ts'
import { isDetachedCancelledPayment } from './staleBooking'
import { prisma } from './prisma'
import {
  applyHistoricalCancelCredit,
  type HistoricalCancelRefundLine,
} from './historicalCancelRefundRepair'
import { historicalRefundIdempotencyKey } from '#shared/historicalRefundRepair.ts'

export type OrphanPaymentRow = {
  paymentId: string
  method: string
  status: string
  amount: number
  userId: string | null
  detachedBookingId: string | null
  proposal: 'wallet_credit' | 'reconcile_only' | 'skip_cash' | 'skip_no_debit' | 'skip_already_settled'
  creditAmount: number
  bookingIdForCredit: string | null
  reason: string
}

export type OrphanPaymentReport = {
  applied: boolean
  rows: OrphanPaymentRow[]
  creditCount: number
  creditToman: number
  appliedRows: Array<{ paymentId: string, bookingId: string | null, amount: number, reason: string }>
  applyErrors: Array<{ paymentId: string, message: string }>
}

async function listOrphanPayments(): Promise<OrphanPaymentRow[]> {
  const payments = await prisma.payment.findMany({
    where: {
      bookingId: null,
      purpose: { not: 'topup' },
      method: { in: ['IPG', 'PAID', 'CASH'] },
      status: { in: ['PAID', 'REFUNDED', 'FAILED', 'SUPERSEDED'] },
    },
    select: {
      id: true,
      amount: true,
      method: true,
      status: true,
      userId: true,
      metadataJson: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })

  const rows: OrphanPaymentRow[] = []
  for (const payment of payments) {
    if (!isDetachedCancelledPayment(payment)) continue
    const meta = parsePaymentMetadata(payment.metadataJson)
    const detachedBookingId = typeof meta.detachedFromBookingId === 'string'
      ? meta.detachedFromBookingId
      : null

    if (payment.method === 'CASH') {
      rows.push({
        paymentId: payment.id,
        method: payment.method,
        status: payment.status,
        amount: payment.amount,
        userId: payment.userId,
        detachedBookingId,
        proposal: 'skip_cash',
        creditAmount: 0,
        bookingIdForCredit: detachedBookingId,
        reason: 'desk_cash_never_wallet',
      })
      continue
    }

    const debits = await prisma.walletTransaction.findMany({
      where: {
        paymentId: payment.id,
        type: { in: ['PAYMENT_DEBIT', 'IPG_BOOKING_DEBIT'] },
      },
      select: { amount: true },
    })
    const walletDebitAbs = debits.reduce((sum, row) => sum + Math.abs(row.amount || 0), 0)
    if (walletDebitAbs <= 0) {
      rows.push({
        paymentId: payment.id,
        method: payment.method,
        status: payment.status,
        amount: payment.amount,
        userId: payment.userId,
        detachedBookingId,
        proposal: 'skip_no_debit',
        creditAmount: 0,
        bookingIdForCredit: detachedBookingId,
        reason: 'no_wallet_debit',
      })
      continue
    }

    const credited = await prisma.walletTransaction.aggregate({
      where: { paymentId: payment.id, type: 'REFUND_CREDIT' },
      _sum: { amount: true },
    })
    const refundCreditSum = Math.max(0, credited._sum.amount || 0)
    const owed = cancelWalletCreditAmount({
      method: payment.method,
      paymentAmount: payment.amount,
      metadata: meta,
    }).amount
    const gap = Math.max(0, Math.min(owed, walletDebitAbs) - refundCreditSum)

    if (gap <= 0) {
      rows.push({
        paymentId: payment.id,
        method: payment.method,
        status: payment.status,
        amount: payment.amount,
        userId: payment.userId,
        detachedBookingId,
        proposal: refundCreditSum > 0 ? 'reconcile_only' : 'skip_already_settled',
        creditAmount: 0,
        bookingIdForCredit: detachedBookingId,
        reason: refundCreditSum > 0 ? 'already_credited' : 'no_gap',
      })
      continue
    }

    rows.push({
      paymentId: payment.id,
      method: payment.method,
      status: payment.status,
      amount: payment.amount,
      userId: payment.userId,
      detachedBookingId,
      proposal: 'wallet_credit',
      creditAmount: gap,
      bookingIdForCredit: detachedBookingId,
      reason: 'orphan_detached_cancel_wallet_gap',
    })
  }

  return rows
}

/** IB-14 — detached payments (booking row removed); dry-run lists wallet credit gaps only. */
export async function runHistoricalOrphanPaymentRepair(opts?: {
  apply?: boolean
}): Promise<OrphanPaymentReport> {
  const apply = opts?.apply === true
  const rows = await listOrphanPayments()
  const creditRows = rows.filter((row) => row.proposal === 'wallet_credit' && row.creditAmount > 0)
  const appliedRows: OrphanPaymentReport['appliedRows'] = []
  const applyErrors: OrphanPaymentReport['applyErrors'] = []

  if (apply) {
    for (const row of creditRows) {
      const line: HistoricalCancelRefundLine = {
        paymentId: row.paymentId,
        bookingId: row.bookingIdForCredit,
        decision: {
          action: 'credit',
          amount: row.creditAmount,
          reason: 'wallet_path_shortfall',
        },
        bucket: 'credit',
      }
      try {
        const key = historicalRefundIdempotencyKey(row.paymentId, row.bookingIdForCredit)
        const before = await prisma.refundReconciliation.findUnique({ where: { idempotencyKey: key } })
        const ok = await applyHistoricalCancelCredit(line, { trustDecision: true })
        const after = await prisma.refundReconciliation.findUnique({ where: { idempotencyKey: key } })
        if (ok || (!before && after)) {
          appliedRows.push({
            paymentId: row.paymentId,
            bookingId: row.bookingIdForCredit,
            amount: row.creditAmount,
            reason: row.reason,
          })
          console.info('[orphan-payment-apply]', JSON.stringify({
            paymentId: row.paymentId,
            bookingId: row.bookingIdForCredit,
            amount: row.creditAmount,
            reason: row.reason,
          }))
        }
      }
      catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        applyErrors.push({ paymentId: row.paymentId, message: message.slice(0, 500) })
        console.error('[orphan-payment-apply]', row.paymentId, message)
      }
    }
  }

  return {
    applied: apply,
    rows,
    creditCount: creditRows.length,
    creditToman: creditRows.reduce((sum, row) => sum + row.creditAmount, 0),
    appliedRows,
    applyErrors,
  }
}