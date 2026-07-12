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
    facilitiesJson?: string | null
  }>(event)
  const sport = await prisma.sport.findFirst({
    where: { slug: body.sportSlug === 'tennis' ? 'tennis' : 'padel' },
  })
  if (!sport) throw createError({ statusCode: 400, statusMessage: 'Invalid sport' })
  if (body.openHour != null && body.closeHour != null && body.openHour >= body.closeHour) {
    throw createError({ statusCode: 400, statusMessage: 'openHour must be before closeHour' })
  }
  return prisma.court.create({
    data: {
      clubId: club.id,
      sportId: sport.id,
      nameFa: body.nameFa?.trim() || 'زمین جدید',
      nameEn: body.nameEn?.trim() || 'New court',
      price: body.price ?? 600000,
      openHour: body.openHour ?? null,
      closeHour: body.closeHour ?? null,
      image: body.image?.trim() || null,
      facilitiesJson: body.facilitiesJson ?? null,
    },
  })
})
