import { numberedCourtNames, parseCourtBulkCount } from '#shared/courtBulk.ts'
import { syncClubCatalogPrices } from '../../../utils/clubCatalogPrices'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const body = await readBody<{
    nameFa?: string
    nameEn?: string
    price?: number
    sportSlug?: string
    openHour?: number | null
    closeHour?: number | null
    image?: string | null
    imagesJson?: string | null
    facilitiesJson?: string | null
    pricingJson?: string | null
    count?: number
  }>(event)
  const sport = await prisma.sport.findFirst({
    where: { slug: body.sportSlug === 'tennis' ? 'tennis' : 'padel' },
  })
  if (!sport) throw createError({ statusCode: 400, statusMessage: 'Invalid sport' })
  const sportId = sport.id
  if (body.openHour != null && body.closeHour != null && body.openHour >= body.closeHour) {
    throw createError({ statusCode: 400, statusMessage: 'openHour must be before closeHour' })
  }

  let count = 1
  try {
    count = parseCourtBulkCount(body.count)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid court count' })
  }

  function courtData(index: number) {
    const names = numberedCourtNames({
      nameFa: body.nameFa,
      nameEn: body.nameEn,
      index,
      total: count,
    })
    return {
      clubId: club.id,
      sportId,
      nameFa: names.nameFa,
      nameEn: names.nameEn,
      price: body.price ?? 600000,
      openHour: body.openHour ?? null,
      closeHour: body.closeHour ?? null,
      image: body.image?.trim() || null,
      imagesJson: body.imagesJson ?? null,
      facilitiesJson: body.facilitiesJson ?? null,
      pricingJson: body.pricingJson ?? null,
    }
  }

  if (count === 1) {
    const created = await prisma.court.create({ data: courtData(1) })
    await syncClubCatalogPrices(club.id)
    return created
  }

  const courts = await prisma.$transaction(
    Array.from({ length: count }, (_, i) => prisma.court.create({ data: courtData(i + 1) })),
  )
  await syncClubCatalogPrices(club.id)
  return { count: courts.length, courts }
})
