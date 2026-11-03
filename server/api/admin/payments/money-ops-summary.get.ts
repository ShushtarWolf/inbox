import { requireAdminSecret } from '../../../utils/adminAuth'
import { runMoneyAudit } from '../../../utils/moneyAudit'
import { pendingOnlineExpireMs } from '../../../utils/paymentSync'
import { prisma } from '../../../utils/prisma'

/** Lightweight admin/cron snapshot: audit counters + actionable payment ids. */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const audit = await runMoneyAudit()

  const [reversePending, stalePending, failedJobs] = await Promise.all([
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
  ])

  return {
    audit,
    actions: {
      reversePending: {
        resolveEndpoint: 'POST /api/admin/payments/resolve-reverse-pending',
        paymentIds: reversePending.map((p) => p.id),
        sample: reversePending,
      },
      stalePendingOnline: {
        expireEndpoint: 'POST /api/admin/payments/expire-pending',
        paymentIds: stalePending.map((p) => p.id),
        sample: stalePending,
      },
      moneyJobs: {
        processEndpoint: 'POST /api/admin/payments/process-money-jobs',
        failed: failedJobs,
      },
    },
  }
})
