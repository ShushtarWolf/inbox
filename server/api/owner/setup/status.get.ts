import { evaluateClubReadiness, minCourtPrice } from '#shared/clubReadiness.ts'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')

  const courts = await prisma.court.findMany({
    where: { clubId: club.id },
    select: { id: true, nameFa: true, nameEn: true, price: true },
    orderBy: { nameFa: 'asc' },
  })

  const owner = club.ownerId
    ? await prisma.user.findUnique({
        where: { id: club.ownerId },
        select: { disabledAt: true, lastLoginAt: true },
      })
    : null

  const readiness = evaluateClubReadiness({
    status: club.status,
    openHour: club.openHour,
    closeHour: club.closeHour,
    nameFa: club.nameFa,
    nameEn: club.nameEn,
    addressFa: club.addressFa,
    courts,
    owner,
  })

  return {
    club: {
      id: club.id,
      slug: club.slug,
      status: club.status,
      openHour: club.openHour,
      closeHour: club.closeHour,
    },
    courts,
    bookable: readiness.bookable,
    checks: readiness.checks.filter((check) => check.id !== 'ownerLogin'),
    catalogPriceFrom: minCourtPrice(courts),
  }
})
