export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  return prisma.discountProgram.findMany({
    where: { clubId: club.id },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          applications: { where: { status: 'PENDING' } },
          memberships: { where: { revokedAt: null } },
        },
      },
    },
  })
})
