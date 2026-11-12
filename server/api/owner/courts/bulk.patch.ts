import { parseCourtAudience } from '#shared/courtAudience.ts'
import { normalizeCourtPricingForSave } from '#shared/courtPricing.ts'
import { repriceFreeSlotsForCourts } from '../../../utils/slots'
import { syncClubCatalogPrices } from '../../../utils/clubCatalogPrices'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const body = await readBody<{
    courtIds?: string[]
    all?: boolean
    price?: number
    sportSlug?: string
    openHour?: number | null
    closeHour?: number | null
    pricingJson?: string | null
    facilitiesJson?: string | null
    audience?: string
  }>(event)

  const data: Record<string, unknown> = {}
  if (body.price !== undefined) data.price = body.price
  if (body.openHour !== undefined) data.openHour = body.openHour
  if (body.closeHour !== undefined) data.closeHour = body.closeHour
  if (body.facilitiesJson !== undefined) data.facilitiesJson = body.facilitiesJson
  if (body.audience !== undefined) {
    const audience = parseCourtAudience(body.audience)
    if (!audience) throw createError({ statusCode: 400, statusMessage: 'Invalid audience' })
    data.audience = audience
  }
  if (body.sportSlug) {
    const sport = await prisma.sport.findFirst({
      where: { slug: body.sportSlug === 'tennis' ? 'tennis' : 'padel' },
    })
    if (sport) data.sportId = sport.id
  }

  if (!Object.keys(data).length && body.pricingJson === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  if (body.openHour !== undefined && body.closeHour !== undefined
    && body.openHour != null && body.closeHour != null
    && body.openHour >= body.closeHour) {
    throw createError({ statusCode: 400, statusMessage: 'openHour must be before closeHour' })
  }

  let courtIds = body.courtIds?.filter(Boolean) ?? []
  if (body.all || !courtIds.length) {
    const courts = await prisma.court.findMany({
      where: { clubId: club.id },
      select: { id: true },
    })
    courtIds = courts.map((court) => court.id)
  } else {
    const owned = await prisma.court.count({
      where: { clubId: club.id, id: { in: courtIds } },
    })
    if (owned !== courtIds.length) {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    }
  }

  if (!courtIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'No courts to update' })
  }

  const pricingChanged = body.price !== undefined || body.pricingJson !== undefined

  if (body.pricingJson === undefined) {
    await prisma.court.updateMany({
      where: { clubId: club.id, id: { in: courtIds } },
      data,
    })
  } else {
    // Time pricing is replaced only when the owner explicitly opted in (client sends
    // pricingJson only then). Normalise per court against that court's own base price.
    const existing = await prisma.court.findMany({
      where: { clubId: club.id, id: { in: courtIds } },
      select: { id: true, price: true },
    })
    await prisma.$transaction(existing.map((court) => prisma.court.update({
      where: { id: court.id },
      data: {
        ...data,
        pricingJson: normalizeCourtPricingForSave(
          body.price !== undefined ? body.price : court.price,
          body.pricingJson,
        ),
      },
    })))
  }

  const updatedCourts = await prisma.court.findMany({
    where: { id: { in: courtIds } },
    include: { sport: true },
  })

  if (pricingChanged) {
    await repriceFreeSlotsForCourts(
      updatedCourts.map((court) => ({
        id: court.id,
        price: court.price,
        pricingJson: court.pricingJson,
      })),
    )
    await syncClubCatalogPrices(club.id)
  }

  return { count: updatedCourts.length, courts: updatedCourts }
})
