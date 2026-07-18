export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const club = await prisma.club.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, email: true, name: true, phone: true, disabledAt: true } },
      courts: {
        select: { id: true, nameFa: true, nameEn: true, sport: { select: { slug: true, nameFa: true } } },
        orderBy: { nameFa: 'asc' },
      },
      memberships: {
        where: { active: true },
        select: {
          role: true,
          user: { select: { id: true, email: true, name: true } },
        },
        take: 20,
      },
      _count: { select: { courts: true, media: true } },
    },
  })

  if (!club) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }

  const bookingCount = await prisma.booking.count({
    where: { slot: { court: { clubId: club.id } } },
  })

  return {
    id: club.id,
    slug: club.slug,
    nameFa: club.nameFa,
    nameEn: club.nameEn,
    city: club.city,
    district: club.district,
    addressFa: club.addressFa,
    status: club.status,
    phone: club.phone,
    openHour: club.openHour,
    closeHour: club.closeHour,
    priceFrom: club.priceFrom,
    priceTo: club.priceTo,
    owner: club.owner,
    courts: club.courts,
    staff: club.memberships,
    courtCount: club._count.courts,
    mediaCount: club._count.media,
    bookingCount,
  }
})
