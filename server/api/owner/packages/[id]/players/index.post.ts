import { assertPackagesEnabled } from '../../../../../utils/packagesGate'
import { countActivePackageSeats, lockPackageRow } from '../../../../../utils/packages'

export default defineEventHandler(async (event) => {
  assertPackagesEnabled(event)
  const { club } = await requireOwnerClub(event, 'calendar')
  const packageId = getRouterParam(event, 'id')
  if (!packageId) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const body = await readBody<{
    guestName?: string
    guestMobile?: string
    level?: number
    athleteId?: string
  }>(event)

  if (!body.guestName?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'guestName required' })
  }

  return prisma.$transaction(async (tx) => {
    await lockPackageRow(tx, packageId)
    const pkg = await tx.packageDraft.findFirst({
      where: { id: packageId, clubId: club.id },
    })
    if (!pkg) throw createError({ statusCode: 404, statusMessage: 'Package not found' })

    const seats = await countActivePackageSeats(pkg.id, tx)
    if (seats >= pkg.capacity) {
      throw createError({ statusCode: 409, statusMessage: 'Package is full' })
    }

    return tx.packagePlayer.create({
      data: {
        packageId: pkg.id,
        guestName: body.guestName!.trim(),
        guestMobile: body.guestMobile?.trim() || null,
        level: body.level ?? null,
        athleteId: body.athleteId || null,
      },
    })
  })
})
