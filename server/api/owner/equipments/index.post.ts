export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event)
  const body = await readBody<{ nameFa?: string; nameEn?: string; category?: string }>(event)
  return prisma.equipment.create({
    data: {
      clubId: club.id,
      nameFa: body.nameFa || 'جدید',
      nameEn: body.nameEn || 'New',
      category: (body.category as 'CLUB') || 'CLUB',
    },
  })
})
