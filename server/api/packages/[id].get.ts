import { assertPackagesEnabled, packagesEnabledForEvent } from '../../utils/packagesGate'
import { countActivePackageSeats } from '../../utils/packages'
import { omitPrivateCoachFields, PUBLIC_CLUB_SUMMARY_SELECT } from '#shared/publicClub.ts'

export default defineEventHandler(async (event) => {
  if (!packagesEnabledForEvent(event)) {
    throw createError({ statusCode: 404, statusMessage: 'Package not found' })
  }
  assertPackagesEnabled(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const pkg = await prisma.packageDraft.findUnique({
    where: { id },
    include: {
      club: { select: PUBLIC_CLUB_SUMMARY_SELECT },
      coach: true,
      court: true,
    },
  })
  if (!pkg || pkg.club.status !== 'ACTIVE' || pkg.status !== 'OPEN') {
    throw createError({ statusCode: 404, statusMessage: 'Package not found' })
  }

  const seats = await countActivePackageSeats(pkg.id)
  // Public: no player list (names / mobiles / athlete ids), no creator id, no private coach fields.
  const { createdByUserId: _createdBy, coach, ...publicPkg } = pkg
  return {
    ...publicPkg,
    coach: coach ? omitPrivateCoachFields(coach) : null,
    seatsUsed: seats,
    seatsLeft: Math.max(0, pkg.capacity - seats),
  }
})
