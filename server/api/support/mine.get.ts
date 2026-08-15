export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      messages: { orderBy: { createdAt: 'asc' }, take: 20 },
      club: { select: { id: true, nameFa: true, slug: true } },
    },
  })
  return { tickets }
})
