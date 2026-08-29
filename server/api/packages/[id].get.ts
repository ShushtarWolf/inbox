import { assertPackagesEnabled, packagesEnabledForEvent } from '../../utils/packagesGate'
import { countActivePackageSeats } from '../../utils/packages'

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
      club: true,
      coach: true,
      court: true,
      players: true,
    },
  })
  if (!pkg || pkg.club.status !== 'ACTIVE' || pkg.status !== 'OPEN') {
    throw createError({ statusCode: 404, statusMessage: 'Package not found' })
  }

  const seats = await countActivePackageSeats(pkg.id)
  return {
    ...pkg,
    seatsUsed: seats,
    seatsLeft: Math.max(0, pkg.capacity - seats),
  }
})
