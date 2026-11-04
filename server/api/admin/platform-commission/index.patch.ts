import {
  buildPlatformCommissionAdminView,
  invalidatePlatformCommissionCache,
  PLATFORM_COMMISSION_SETTING_ID,
} from '../../../utils/platformCommission.ts'

/**
 * Set platform-wide default commission (bps 0–10000).
 * bps > 0 requires confirmRefundRisk — documents YELLOW audit refund/float asymmetry.
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const body = await readBody<{ commissionBps?: number; confirmRefundRisk?: boolean }>(event)
  const raw = body?.commissionBps
  if (!Number.isInteger(raw) || (raw as number) < 0 || (raw as number) > 10_000) {
    throw createError({ statusCode: 400, statusMessage: 'commissionBps must be an integer 0–10000' })
  }
  const nextBps = raw as number
  if (nextBps > 0 && body?.confirmRefundRisk !== true) {
    throw createError({
      statusCode: 400,
      statusMessage: 'confirmRefundRisk must be true when commissionBps > 0',
    })
  }

  const existing = await prisma.platformCommissionSetting.findUnique({
    where: { id: PLATFORM_COMMISSION_SETTING_ID },
    select: { commissionBps: true },
  })
  const fromBps = existing?.commissionBps ?? 0
  if (fromBps === nextBps) {
    return buildPlatformCommissionAdminView()
  }

  await prisma.$transaction(async (tx) => {
    await tx.platformCommissionChange.create({
      data: {
        fromBps,
        toBps: nextBps,
        actor: 'admin-secret',
        ackRefundRisk: nextBps > 0 ? Boolean(body?.confirmRefundRisk) : false,
      },
    })
    await tx.platformCommissionSetting.upsert({
      where: { id: PLATFORM_COMMISSION_SETTING_ID },
      create: { id: PLATFORM_COMMISSION_SETTING_ID, commissionBps: nextBps },
      update: { commissionBps: nextBps },
    })
  })

  invalidatePlatformCommissionCache()
  return buildPlatformCommissionAdminView()
})
