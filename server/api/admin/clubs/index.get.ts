export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status : undefined
  const q = typeof query.q === 'string' ? query.q.trim() : ''

  const clubs = await prisma.club.findMany({
    where: {
      ...(status && ['PENDING', 'ACTIVE', 'SUSPENDED'].includes(status)
        ? { status: status as 'PENDING' | 'ACTIVE' | 'SUSPENDED' }
        : {}),
      ...(q
        ? {
            OR: [
              { nameFa: { contains: q, mode: 'insensitive' } },
              { nameEn: { contains: q, mode: 'insensitive' } },
              { city: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: {
      owner: { select: { id: true, email: true, name: true, disabledAt: true } },
      _count: { select: { courts: true } },
    },
    orderBy: [{ status: 'asc' }, { nameFa: 'asc' }],
    take: 200,
  })

  const bookingCounts = await Promise.all(
    clubs.map((club) =>
      prisma.booking.count({
        where: { slot: { court: { clubId: club.id } } },
      }),
    ),
  )

  return {
    clubs: clubs.map((club, index) => ({
      id: club.id,
      slug: club.slug,
      nameFa: club.nameFa,
      nameEn: club.nameEn,
      city: club.city,
      status: club.status,
      owner: club.owner,
      courtCount: club._count.courts,
      bookingCount: bookingCounts[index] || 0,
    })),
  }
})
