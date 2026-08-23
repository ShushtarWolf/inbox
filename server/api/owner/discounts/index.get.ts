export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  return prisma.discountCode.findMany({
    where: { clubId: club.id },
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
  })
})
