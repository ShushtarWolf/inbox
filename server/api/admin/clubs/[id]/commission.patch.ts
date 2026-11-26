import { resolveClubCommissionBps, resolveCoachCourtCommissionBps } from '#shared/settlement.ts'
import { loadPlatformCommissionSettings } from '../../../../utils/platformCommission.ts'

/**
 * Set a club's platform commission (bps 0–10000), or null to use PLATFORM_COMMISSION_BPS.
 * Applies to settlements created after the change; existing ledger rows keep their snapshot.
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{
    commissionBps?: number | null
    coachCourtCommissionBps?: number | null
  }>(event)
  const raw = body?.commissionBps
  const rawCoachCourt = body?.coachCourtCommissionBps
  const valid = raw === null || (Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) <= 10_000)
  const coachCourtValid = rawCoachCourt === undefined || rawCoachCourt === null
    || (Number.isInteger(rawCoachCourt) && (rawCoachCourt as number) >= 0 && (rawCoachCourt as number) <= 10_000)
  if (!id || raw === undefined || !valid || !coachCourtValid) {
    throw createError({ statusCode: 400, statusMessage: 'commissionBps must be an integer 0–10000 or null' })
  }

  const exists = await prisma.club.findUnique({
    where: { id },
    select: { id: true, commissionBps: true, coachCourtCommissionBps: true },
  })
  if (!exists) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }

  const platformSettings = await loadPlatformCommissionSettings()
  const nextClubBps = raw === undefined ? exists.commissionBps : raw
  const effectiveAthleteBps = resolveClubCommissionBps(nextClubBps, platformSettings.commissionBps)
  if (rawCoachCourt != null && (rawCoachCourt as number) > effectiveAthleteBps) {
    throw createError({
      statusCode: 400,
      statusMessage: 'coachCourtCommissionBps cannot exceed effective athlete commission for this club',
    })
  }

  const club = await prisma.$transaction(async (tx) => {
    await tx.clubCommissionChange.create({
      data: {
        clubId: id,
        fromBps: exists.commissionBps,
        toBps: raw,
        actor: 'admin-secret',
      },
    })
    return tx.club.update({
      where: { id },
      data: {
        commissionBps: raw,
        ...(rawCoachCourt !== undefined ? { coachCourtCommissionBps: rawCoachCourt } : {}),
      },
      select: { id: true, commissionBps: true, coachCourtCommissionBps: true },
    })
  })

  return {
    id: club.id,
    commissionBps: club.commissionBps,
    coachCourtCommissionBps: club.coachCourtCommissionBps,
    effectiveCommissionBps: resolveClubCommissionBps(club.commissionBps, platformSettings.commissionBps),
    effectiveCoachCourtCommissionBps: resolveCoachCourtCommissionBps({
      clubCommissionBps: club.commissionBps,
      platformCommissionBps: platformSettings.commissionBps,
      platformCoachCourtCommissionBps: platformSettings.coachCourtCommissionBps,
      clubCoachCourtCommissionBps: club.coachCourtCommissionBps,
    }),
  }
})
