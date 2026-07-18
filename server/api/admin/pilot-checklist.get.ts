import { evaluateClubReadiness, minCourtPrice } from '#shared/clubReadiness.ts'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)

  const clubs = await prisma.club.findMany({
    orderBy: { nameFa: 'asc' },
    take: 50,
    select: {
      id: true,
      slug: true,
      nameFa: true,
      nameEn: true,
      addressFa: true,
      status: true,
      openHour: true,
      closeHour: true,
      priceFrom: true,
      owner: {
        select: {
          id: true,
          email: true,
          disabledAt: true,
          lastLoginAt: true,
        },
      },
      courts: {
        select: { id: true, price: true },
      },
    },
  })

  return {
    clubs: clubs.map((club) => {
      const readiness = evaluateClubReadiness({
        status: club.status,
        openHour: club.openHour,
        closeHour: club.closeHour,
        nameFa: club.nameFa,
        nameEn: club.nameEn,
        addressFa: club.addressFa,
        courts: club.courts,
        owner: club.owner,
      })
      return {
        id: club.id,
        slug: club.slug,
        nameFa: club.nameFa,
        nameEn: club.nameEn,
        status: club.status,
        openHour: club.openHour,
        closeHour: club.closeHour,
        courtCount: club.courts.length,
        priceFrom: minCourtPrice(club.courts) ?? club.priceFrom,
        ownerEmail: club.owner?.email ?? null,
        ownerLastLoginAt: club.owner?.lastLoginAt?.toISOString() ?? null,
        bookable: readiness.bookable,
        checks: readiness.checks,
      }
    }),
  }
})
