import { evaluateClubReadiness } from '#shared/clubReadiness.ts'
import { syncClubCatalogPrices } from '../../../utils/clubCatalogPrices'

/** Validate bookability and sync catalog priceFrom from court prices. Coaches are never required. */
export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')

  const courts = await prisma.court.findMany({
    where: { clubId: club.id },
    select: { price: true, pricingJson: true },
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

  await prisma.club.update({
    where: { id: club.id },
    data: { status: 'ACTIVE' },
  })
  const synced = await syncClubCatalogPrices(club.id)
  const updated = synced
    ? { id: club.id, slug: club.slug, status: 'ACTIVE' as const, priceFrom: synced.priceFrom }
    : await prisma.club.findUniqueOrThrow({
        where: { id: club.id },
        select: { id: true, slug: true, status: true, priceFrom: true },
      })

  return {
    ok: true,
    club: updated,
    bookable: true,
  }
})
