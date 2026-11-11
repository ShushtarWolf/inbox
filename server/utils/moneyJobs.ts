import type { Prisma } from '@prisma/client'
import { isWalletTopUpPayment } from '#shared/walletTopUp.ts'
import { notifyAdminSms } from './adminNotify'
import { prisma } from './prisma'
import { canSettleOwnerForPaidPayment } from '#shared/deskPaidGuard.ts'
import { creditOwnerForPaidPayment } from './settlement'
import { promoteSplitPayAmountOnPaid } from './splitPayWallet'
import { creditWalletForTopUpPayment } from './wallet'

type DbClient = Prisma.TransactionClient | typeof prisma

const MAX_JOB_ATTEMPTS = 12

/** Enqueue idempotent post-PAID work (settlement / top-up credit). Safe to call repeatedly. */
export async function enqueueMoneyJobsForPaidPayment(
  paymentId: string,
  db: DbClient = prisma,
) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, status: true, purpose: true, method: true, gatewayRef: true, metadataJson: true },
  })
  if (!payment || payment.status !== 'PAID') return { enqueued: 0 as const }

  const types: Array<'SETTLE' | 'TOPUP_CREDIT'> = []
  if (isWalletTopUpPayment(payment)) {
    types.push('TOPUP_CREDIT')
  }
  else if (canSettleOwnerForPaidPayment(payment)) {
    types.push('SETTLE')
  }
  if (types.length === 0) return { enqueued: 0 as const }

  const jobModel = (db as typeof prisma).moneyJob
  if (!jobModel?.createMany) return { enqueued: 0 as const }

  // skipDuplicates (ON CONFLICT DO NOTHING): a caught P2002 would still abort the caller's Postgres txn.
  const { count } = await jobModel.createMany({
    data: types.map((type) => ({ paymentId, type, status: 'PENDING' as const })),
    skipDuplicates: true,
  })
  return { enqueued: count }
}

async function markJobDone(jobId: string, db: DbClient) {
  await db.moneyJob.update({
    where: { id: jobId },
    data: { status: 'DONE', processedAt: new Date(), lastError: null },
  })
}

/**
 * Clear pending jobs whose effect already exists (ledger row / TOPUP_CREDIT line).
 * Never close a job just because the sync path ran — a repeat callback is a no-op there.
 */
export async function markMoneyJobsDoneForPaidPayment(paymentId: string, db: DbClient = prisma) {
  const jobs = (db as typeof prisma).moneyJob
  if (!jobs?.updateMany) return
  const [ledger, topUpCredit] = await Promise.all([
    db.settlementLedgerEntry.findUnique({ where: { paymentId }, select: { id: true } }),
    db.walletTransaction.findFirst({ where: { paymentId, type: 'TOPUP_CREDIT' }, select: { id: true } }),
  ])
  const doneTypes = [
    ...(ledger ? ['SETTLE' as const] : []),
    ...(topUpCredit ? ['TOPUP_CREDIT' as const] : []),
  ]
  if (!doneTypes.length) return
  await jobs.updateMany({
    where: { paymentId, status: 'PENDING', type: { in: doneTypes } },
    data: { status: 'DONE', processedAt: new Date(), lastError: null },
  })
}

async function markJobFailed(jobId: string, message: string, db: DbClient) {
  await db.moneyJob.update({
    where: { id: jobId },
    data: {
      status: 'PENDING',
      attempts: { increment: 1 },
      lastError: message.slice(0, 500),
    },
  })
}

async function processOneMoneyJob(job: {
  id: string
  paymentId: string
  type: 'SETTLE' | 'TOPUP_CREDIT'
  attempts: number
}) {
  if (job.attempts >= MAX_JOB_ATTEMPTS) {
    await prisma.moneyJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', lastError: 'max_attempts' },
    })
    try {
      await notifyAdminSms('ADMIN_WITHDRAW_REQUEST', {
        kind: 'money-job-dead-letter',
        amount: job.attempts,
        sheba: `${job.type}:${job.paymentId}`,
        userName: 'money-job',
        userPhone: '',
        requestId: job.id,
      })
    }
    catch (err) {
      console.error('[moneyJobs:deadLetterNotify]', job.id, err)
    }
    return { processed: false as const, reason: 'max_attempts' as const }
  }

  const payment = await prisma.payment.findUnique({ where: { id: job.paymentId } })
  if (!payment || payment.status !== 'PAID') {
    await markJobDone(job.id, prisma)
    return { processed: true as const, reason: 'not_paid' as const }
  }

  try {
    if (job.type === 'TOPUP_CREDIT') {
      const result = await creditWalletForTopUpPayment(job.paymentId, 'PENDING_ONLINE')
      if (result.credited || result.reason === 'already_credited' || result.reason === 'already_paid') {
        await markJobDone(job.id, prisma)
        return { processed: true as const, reason: result.reason }
      }
      // Permanent: cannot credit without a user (healOrphanTopUps recovers pan matches first).
      if (result.reason === 'no_user') {
        await prisma.moneyJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', lastError: 'orphan_no_user', attempts: { increment: 1 } },
        })
        return { processed: false as const, reason: 'orphan_no_user' as const }
      }
      await markJobFailed(job.id, result.reason, prisma)
      return { processed: false as const, reason: result.reason }
    }

    // Crash between SEP confirm and the sync path skips promote — settle the full split price.
    await promoteSplitPayAmountOnPaid(job.paymentId)
    const result = await creditOwnerForPaidPayment(job.paymentId, 'PENDING_ONLINE')
    if (
      result.credited
      || result.reason === 'already_settled'
      || result.reason === 'already_paid'
      || result.reason === 'cash_not_settled'
      || result.reason === 'ipg_unverified'
      || result.reason === 'not_paid_booking'
    ) {
      await markJobDone(job.id, prisma)
      return { processed: true as const, reason: result.reason }
    }
    await markJobFailed(job.id, result.reason, prisma)
    return { processed: false as const, reason: result.reason }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await markJobFailed(job.id, message, prisma)
    return { processed: false as const, reason: 'error' as const }
  }
}

/** Re-queue FAILED jobs (e.g. after deploy fix) — caps attempts reset not required. */
export async function requeueFailedMoneyJobs(limit = 30) {
  const jobs = await prisma.moneyJob.findMany({
    where: { status: 'FAILED' },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
  for (const job of jobs) {
    await prisma.moneyJob.update({
      where: { id: job.id },
      data: { status: 'PENDING', lastError: null },
    })
  }
  return { requeued: jobs.length }
}

/** Worker: process pending money jobs (cron / admin). */
export async function processPendingMoneyJobs(limit = 50) {
  const jobs = await prisma.moneyJob.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
  const results = []
  for (const job of jobs) {
    results.push(await processOneMoneyJob(job))
  }
  return { scanned: jobs.length, results }
}

/** Effect is still missing, so a DONE job here was closed wrongly — reopen it. */
async function reopenMoneyJob(paymentId: string, type: 'SETTLE' | 'TOPUP_CREDIT') {
  await prisma.moneyJob.createMany({
    data: [{ paymentId, type, status: 'PENDING' }],
    skipDuplicates: true,
  })
  await prisma.moneyJob.updateMany({
    where: { paymentId, type, status: 'DONE' },
    data: { status: 'PENDING', processedAt: null },
  })
}

/**
 * Safety net: PAID booking payments without settlement ledger, and top-ups without TOPUP_CREDIT.
 * Newest first; FAILED jobs are skipped (ops summary lists them) so they cannot starve the window.
 */
export async function reconcilePaidPaymentsMissingLedger(limit = 40) {
  const paidBooking = await prisma.payment.findMany({
    where: {
      status: 'PAID',
      purpose: { not: 'topup' },
      method: { not: 'CASH' },
      settlementLedgerEntry: { is: null },
      moneyJobs: { none: { type: 'SETTLE', status: 'FAILED' } },
    },
    select: { id: true, method: true, gatewayRef: true, metadataJson: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  // Orphans (null userId) are handled by healOrphanTopUps — do not spin jobs forever.
  const paidTopUp = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT p.id FROM "Payment" p
    WHERE p.status = 'PAID' AND p.purpose = 'topup' AND p."userId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "WalletTransaction" t
        WHERE t."paymentId" = p.id AND t.type = 'TOPUP_CREDIT'
      )
      AND NOT EXISTS (
        SELECT 1 FROM "MoneyJob" j
        WHERE j."paymentId" = p.id AND j.type = 'TOPUP_CREDIT' AND j.status = 'FAILED'
      )
    ORDER BY p."createdAt" DESC
    LIMIT ${limit}
  `

  for (const row of paidBooking) {
    if (!canSettleOwnerForPaidPayment(row)) continue
    await reopenMoneyJob(row.id, 'SETTLE')
  }
  for (const row of paidTopUp) {
    await reopenMoneyJob(row.id, 'TOPUP_CREDIT')
  }

  return processPendingMoneyJobs(limit)
}
