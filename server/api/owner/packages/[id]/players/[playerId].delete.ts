import { assertPackagesEnabled } from '../../../../../../utils/packagesGate'

export default defineEventHandler(async (event) => {
  assertPackagesEnabled(event)
  const { club } = await requireOwnerClub(event, 'calendar')
  const packageId = getRouterParam(event, 'id')
  const playerId = getRouterParam(event, 'playerId')
  if (!packageId || !playerId) {
    throw createError({ statusCode: 400, statusMessage: 'id required' })
  }

  const pkg = await prisma.packageDraft.findFirst({
    where: { id: packageId, clubId: club.id },
  })
  if (!pkg) throw createError({ statusCode: 404, statusMessage: 'Package not found' })

  const player = await prisma.packagePlayer.findFirst({
    where: { id: playerId, packageId: pkg.id },
  })
  if (!player) throw createError({ statusCode: 404, statusMessage: 'Player not found' })

  await prisma.packagePlayer.delete({ where: { id: player.id } })
  return { ok: true }
})
