import { isRecurringReserveEnabled } from '#shared/recurringReserve.ts'

export default defineEventHandler(async (event) => {
  if (!isRecurringReserveEnabled()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'RECURRING_RESERVE_DISABLED',
    })
  }
  const { club } = await requireOwnerClub(event, 'calendar')
  const packageId = getRouterParam(event, 'id')
  const playerId = getRouterParam(event, 'playerId')

  const player = await prisma.packagePlayer.findFirst({
    where: { id: playerId, package: { id: packageId, clubId: club.id } },
  })
  if (!player) throw createError({ statusCode: 404, statusMessage: 'Player not found' })

  await prisma.packagePlayer.delete({ where: { id: player.id } })
  return { ok: true }
})
