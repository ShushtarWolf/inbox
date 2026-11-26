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
  const body = await readBody<{
    commissionBps?: number
    coachCourtCommissionBps?: number | null
    confirmRefundRisk?: boolean
  }>(event)
  const raw = body?.commissionBps
  if (!Number.isInteger(raw) || (raw as number) < 0 || (raw as number) > 10_000) {
    throw createError({ statusCode: 400, statusMessage: 'commissionBps must be an integer 0–10000' })
  }
  const nextBps = raw as number
  let nextCoachCourt: number | null | undefined
  if (body?.coachCourtCommissionBps !== undefined) {
    const coachRaw = body.coachCourtCommissionBps
  const coachValid = coachRaw === null
    || (Number.isInteger(coachRaw) && (coachRaw as number) >= 0 && (coachRaw as number) <= 10_000)
    if (!coachValid) {
      throw createError({ statusCode: 400, statusMessage: 'coachCourtCommissionBps must be 0–10000 or null' })
    }
    if (coachRaw != null && (coachRaw as number) > nextBps) {
      throw createError({
        statusCode: 400,
        statusMessage: 'coachCourtCommissionBps cannot exceed commissionBps',
      })
    }
    nextCoachCourt = coachRaw
  }
  if (nextBps > 0 && body?.confirmRefundRisk !== true) {
    throw createError({
      statusCode: 400,
      statusMessage: 'confirmRefundRisk must be true when commissionBps > 0',
    })
  }

  const existing = await prisma.platformCommissionSetting.findUnique({
    where: { id: PLATFORM_COMMISSION_SETTING_ID },
    select: { commissionBps: true, coachCourtCommissionBps: true },
  })
  const fromBps = existing?.commissionBps ?? 0
  const fromCoachCourt = existing?.coachCourtCommissionBps ?? null
  const coachCourtUnchanged = nextCoachCourt === undefined || nextCoachCourt === fromCoachCourt
  if (fromBps === nextBps && coachCourtUnchanged) {
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
      create: {
        id: PLATFORM_COMMISSION_SETTING_ID,
        commissionBps: nextBps,
        coachCourtCommissionBps: nextCoachCourt === undefined ? null : nextCoachCourt,
      },
      update: {
        commissionBps: nextBps,
        ...(nextCoachCourt !== undefined ? { coachCourtCommissionBps: nextCoachCourt } : {}),
      },
    })
  })

  invalidatePlatformCommissionCache()
  return buildPlatformCommissionAdminView()
})
