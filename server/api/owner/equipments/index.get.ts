export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  return prisma.equipment.findMany({ where: { clubId: club.id }, orderBy: { category: 'asc' } })
})
