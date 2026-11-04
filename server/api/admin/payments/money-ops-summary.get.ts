import { requireAdminSecret } from '../../../utils/adminAuth'
import { runMoneyAudit } from '../../../utils/moneyAudit'
import { pendingOnlineExpireMs } from '../../../utils/paymentSync'
import { prisma } from '../../../utils/prisma'

/** Lightweight admin/cron snapshot: audit counters + actionable payment ids. */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const audit = await runMoneyAudit()

  const [reversePending, reversedStillPaid, stalePending, failedJobs, pendingJobs, unpaidTopUps] = await Promise.all([
    prisma.payment.findMany({
      where: {
        status: 'PAID',
        metadataJson: { contains: '"reversePending":true' },
      },
      select: { id: true, providerRef: true, updatedAt: true },
      take: 30,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.payment.findMany({
      where: {
        status: 'PAID',
        metadataJson: { contains: '"gatewayReversed":true' },
      },
      select: { id: true, bookingId: true, coachSessionId: true, packageBookingId: true, updatedAt: true },
      take: 30,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.payment.findMany({
      where: {
        status: 'PENDING_ONLINE',
        createdAt: {
          lt: new Date(Date.now() - pendingOnlineExpireMs()),
        },
      },
      select: { id: true, providerRef: true, updatedAt: true },
      take: 30,
      orderBy: { updatedAt: 'asc' },
    }),
    prisma.moneyJob.findMany({
      where: { status: 'FAILED' },
      select: { id: true, paymentId: true, type: true, attempts: true, lastError: true },
      take: 30,
      orderBy: { createdAt: 'desc' },
    }).catch(() => []),
    prisma.moneyJob.findMany({
      where: { status: 'PENDING' },
      select: { id: true, paymentId: true, type: true, attempts: true, lastError: true, createdAt: true },
      take: 30,
      orderBy: { createdAt: 'asc' },
    }).catch(() => []),
    prisma.$queryRaw<Array<{
      id: string
      amount: number
      userId: string | null
      purpose: string | null
      status: string
      method: string | null
      createdAt: Date
    }>>`
      SELECT p.id, p.amount, p."userId", p.purpose, p.status, p.method, p."createdAt"
      FROM "Payment" p
      WHERE p.status = 'PAID' AND p.purpose = 'topup'
        AND NOT EXISTS (
          SELECT 1 FROM "WalletTransaction" t
          WHERE t."paymentId" = p.id AND t.type = 'TOPUP_CREDIT'
        )
      ORDER BY p."createdAt" DESC
      LIMIT 20
    `.catch(() => []),
  ])

  return {
    audit,
    owedSlaHours: 48,
    actions: {
      reversePending: {
        resolveEndpoint: 'POST /api/admin/payments/resolve-reverse-pending',
        paymentIds: reversePending.map((p) => p.id),
        sample: reversePending,
      },
      // Card already refunded at SEP; booking + club settlement still live until healed.
      reversedStillPaid: {
        action: 'POST /api/admin/payments/process-money-jobs (healReversed default) or re-run cancel',
        paymentIds: reversedStillPaid.map((p) => p.id),
        sample: reversedStillPaid,
      },
      stalePendingOnline: {
        expireEndpoint: 'POST /api/admin/payments/expire-pending',
        paymentIds: stalePending.map((p) => p.id),
        sample: stalePending,
      },
      moneyJobs: {
        processEndpoint: 'POST /api/admin/payments/process-money-jobs',
        failed: failedJobs,
        pending: pendingJobs,
      },
      paidTopUpWithoutCredit: {
        action: 'POST /api/admin/payments/process-money-jobs with reconcile — credits TOPUP_CREDIT',
        sample: unpaidTopUps,
      },
      owedAged: {
        manualBankRefundsOwedAged: audit.manualBankRefundsOwedAged,
        deskCashReturnsOwedAged: audit.deskCashReturnsOwedAged,
        action: 'Ack desk cash / mark manual bank refund returned in admin payments',
      },
    },
  }
})
