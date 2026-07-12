export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const id = getRouterParam(event, 'id')
  const body = await readBody<{
    nameFa?: string
    nameEn?: string
    price?: number
    sportSlug?: string
    openHour?: number | null
    closeHour?: number | null
    image?: string | null
    facilitiesJson?: string | null
  }>(event)
  const court = await prisma.court.findFirst({ where: { id, clubId: club.id } })
  if (!court) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const data: Record<string, unknown> = {}
  if (body.nameFa) data.nameFa = body.nameFa.trim()
  if (body.nameEn) data.nameEn = body.nameEn.trim()
  if (body.price !== undefined) data.price = body.price
  if (body.openHour !== undefined) data.openHour = body.openHour
  if (body.closeHour !== undefined) data.closeHour = body.closeHour
  if (body.image !== undefined) data.image = body.image?.trim() || null
  if (body.facilitiesJson !== undefined) data.facilitiesJson = body.facilitiesJson
  if (body.sportSlug) {
    const sport = await prisma.sport.findFirst({
      where: { slug: body.sportSlug === 'tennis' ? 'tennis' : 'padel' },
    })
    if (sport) data.sportId = sport.id
  }

  const openHour = body.openHour !== undefined ? body.openHour : court.openHour
  const closeHour = body.closeHour !== undefined ? body.closeHour : court.closeHour
  if (openHour != null && closeHour != null && openHour >= closeHour) {
    throw createError({ statusCode: 400, statusMessage: 'openHour must be before closeHour' })
  }

  return prisma.court.update({
    where: { id: court.id },
    data,
  })
})
