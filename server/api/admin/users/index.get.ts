import type { Role } from '@prisma/client'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const role = typeof query.role === 'string' ? query.role : undefined
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const disabled = typeof query.disabled === 'string' ? query.disabled : undefined

  const users = await prisma.user.findMany({
    where: {
      ...(role && ['ATHLETE', 'COACH', 'CLUB_ADMIN'].includes(role) ? { role: role as Role } : {}),
      ...(disabled === 'true' ? { disabledAt: { not: null } } : {}),
      ...(disabled === 'false' ? { disabledAt: null } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      nameEn: true,
      role: true,
      phone: true,
      locale: true,
      disabledAt: true,
      createdAt: true,
      ownedClubs: { select: { id: true, nameFa: true, slug: true, status: true }, take: 5 },
      _count: { select: { bookings: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return {
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      nameEn: user.nameEn,
      role: user.role,
      phone: user.phone,
      locale: user.locale,
      disabled: Boolean(user.disabledAt),
      disabledAt: user.disabledAt,
      createdAt: user.createdAt,
      clubs: user.ownedClubs,
      bookingCount: user._count.bookings,
    })),
  }
})
