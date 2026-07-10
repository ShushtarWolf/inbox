export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const body = await readBody<{ nameFa?: string; nameEn?: string; price?: number; sportSlug?: string }>(event)
  const sport = await prisma.sport.findFirst({
    where: { slug: body.sportSlug === 'tennis' ? 'tennis' : 'padel' },
  })
  if (!sport) throw createError({ statusCode: 400, statusMessage: 'Invalid sport' })
  return prisma.court.create({
    data: {
      clubId: club.id,
      sportId: sport.id,
      nameFa: body.nameFa?.trim() || 'زمین جدید',
      nameEn: body.nameEn?.trim() || 'New court',
      price: body.price ?? 600000,
    },
  })
})
