import type { Prisma } from '@prisma/client'
import { isWalletTopUpPayment } from '#shared/walletTopUp.ts'
import { prisma } from './prisma'
import { creditOwnerForPaidPayment } from './settlement'
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
    select: { id: true, status: true, purpose: true, method: true },
  })
  if (!payment || payment.status !== 'PAID') return { enqueued: 0 as const }

  const types: Array<'SETTLE' | 'TOPUP_CREDIT'> = []
  if (isWalletTopUpPayment(payment)) {
    types.push('TOPUP_CREDIT')
  }
  else if (payment.method !== 'CASH') {
    types.push('SETTLE')
  }
  if (types.length === 0) return { enqueued: 0 as const }

  const jobModel = (db as typeof prisma).moneyJob
  if (!jobModel?.create) return { enqueued: 0 as const }

  let enqueued = 0
  for (const type of types) {
    try {
      await jobModel.create({
        data: { paymentId, type, status: 'PENDING' },
      })
      enqueued += 1
    }
    catch (err) {
      const code = err && typeof err === 'object' && 'code' in err
        ? String((err as { code: unknown }).code)
        : ''
      if (
        code === 'P2002'
        || (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
      ) {
        continue
      }
      throw err
    }
  }
  return { enqueued }
}

async function markJobDone(jobId: string, db: DbClient) {
  await db.moneyJob.update({
    where: { id: jobId },
    data: { status: 'DONE', processedAt: new Date(), lastError: null },
  })
}

/** After synchronous confirm/settle succeeded, clear matching pending jobs. */
export async function markMoneyJobsDoneForPaidPayment(paymentId: string, db: DbClient = prisma) {
  const jobs = (db as typeof prisma).moneyJob
  if (!jobs?.updateMany) return
  await jobs.updateMany({
    where: { paymentId, status: 'PENDING' },
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
      await markJobFailed(job.id, result.reason, prisma)
      return { processed: false as const, reason: result.reason }
    }

    const result = await creditOwnerForPaidPayment(job.paymentId, 'PENDING_ONLINE')
    if (
      result.credited
      || result.reason === 'already_settled'
      || result.reason === 'already_paid'
      || result.reason === 'cash_not_settled'
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

/**
 * Safety net: PAID booking payments without settlement ledger, and top-ups without TOPUP_CREDIT.
 * Enqueues jobs then processes pending queue.
 */
export async function reconcilePaidPaymentsMissingLedger(limit = 40) {
  const paidBooking = await prisma.payment.findMany({
    where: {
      status: 'PAID',
      purpose: { not: 'topup' },
      method: { not: 'CASH' },
      settlementLedgerEntry: { is: null },
    },
    select: { id: true },
    take: limit,
  })

  const paidTopUpCandidates = await prisma.payment.findMany({
    where: {
      status: 'PAID',
      purpose: 'topup',
    },
    select: { id: true },
    take: limit * 2,
  })
  const creditedTopUpIds = paidTopUpCandidates.length
    ? (await prisma.walletTransaction.findMany({
        where: {
          paymentId: { in: paidTopUpCandidates.map((p) => p.id) },
          type: 'TOPUP_CREDIT',
        },
        select: { paymentId: true },
      })).map((row) => row.paymentId).filter(Boolean) as string[]
    : []
  const creditedSet = new Set(creditedTopUpIds)
  const paidTopUp = paidTopUpCandidates
    .filter((p) => !creditedSet.has(p.id))
    .slice(0, limit)

  for (const row of paidBooking) {
    await enqueueMoneyJobsForPaidPayment(row.id)
  }
  for (const row of paidTopUp) {
    await enqueueMoneyJobsForPaidPayment(row.id)
  }

  return processPendingMoneyJobs(limit)
}
