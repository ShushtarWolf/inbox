import { evaluateClubReadiness, minCourtPrice } from '#shared/clubReadiness.ts'

/** Validate bookability and sync catalog priceFrom from court prices. Coaches are never required. */
export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')

  const courts = await prisma.court.findMany({
    where: { clubId: club.id },
    select: { price: true },
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

  if (!readiness.bookable) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Club is not ready for public booking',
      data: {
        checks: readiness.checks.filter((check) => check.id !== 'ownerLogin'),
      },
    })
  }

  const priceFrom = minCourtPrice(courts)
  const updated = await prisma.club.update({
    where: { id: club.id },
    data: {
      status: 'ACTIVE',
      ...(priceFrom != null ? { priceFrom } : {}),
    },
    select: { id: true, slug: true, status: true, priceFrom: true },
  })

  return {
    ok: true,
    club: updated,
    bookable: true,
  }
})
