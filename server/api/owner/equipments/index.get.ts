export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  // No default catalog: clubs create their own equipment; empty is valid.
  return prisma.equipment.findMany({ where: { clubId: club.id }, orderBy: { category: 'asc' } })
})
