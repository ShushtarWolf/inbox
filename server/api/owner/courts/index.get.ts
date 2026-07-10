export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  return prisma.court.findMany({
    where: { clubId: club.id },
    include: { sport: true },
    orderBy: { nameFa: 'asc' },
  })
})
