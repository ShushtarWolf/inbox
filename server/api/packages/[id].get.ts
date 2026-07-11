import { parseJsonArray } from '../../utils/catalog'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const pkg = await prisma.packageDraft.findUnique({
    where: { id },
    include: {
      coach: { select: { id: true, nameFa: true, nameEn: true, photo: true } },
      club: { select: { id: true, slug: true, nameFa: true, nameEn: true, city: true, status: true } },
      bookings: { where: { status: { not: 'CANCELLED' } }, select: { id: true } },
    },
  })
  if (!pkg || pkg.club.status !== 'ACTIVE') {
    throw createError({ statusCode: 404, statusMessage: 'Package not found' })
  }

  const spotsLeft = Math.max(0, pkg.capacity - pkg.bookings.length)
  const { bookings: _bookings, ...rest } = pkg
  return {
    ...rest,
    days: parseJsonArray(pkg.daysJson),
    spotsLeft,
    isFull: spotsLeft <= 0,
  }
})
