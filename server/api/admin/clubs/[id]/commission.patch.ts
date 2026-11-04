import { resolveClubCommissionBps } from '#shared/settlement.ts'

/**
 * Set a club's platform commission (bps 0–10000), or null to use PLATFORM_COMMISSION_BPS.
 * Applies to settlements created after the change; existing ledger rows keep their snapshot.
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ commissionBps?: number | null }>(event)
  const raw = body?.commissionBps
  const valid = raw === null || (Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) <= 10_000)
  if (!id || raw === undefined || !valid) {
    throw createError({ statusCode: 400, statusMessage: 'commissionBps must be an integer 0–10000 or null' })
  }

  const exists = await prisma.club.findUnique({
    where: { id },
    select: { id: true, commissionBps: true },
  })
  if (!exists) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
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
      data: { commissionBps: raw },
      select: { id: true, commissionBps: true },
    })
  })

  return {
    id: club.id,
    commissionBps: club.commissionBps,
    effectiveCommissionBps: resolveClubCommissionBps(club.commissionBps),
  }
})
