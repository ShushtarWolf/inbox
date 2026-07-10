export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ nameFa?: string; nameEn?: string; price?: number }>(event)
  const court = await prisma.court.findFirst({ where: { id, clubId: club.id } })
  if (!court) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return prisma.court.update({
    where: { id: court.id },
    data: {
      ...(body.nameFa ? { nameFa: body.nameFa.trim() } : {}),
      ...(body.nameEn ? { nameEn: body.nameEn.trim() } : {}),
      ...(body.price !== undefined ? { price: body.price } : {}),
    },
  })
})
