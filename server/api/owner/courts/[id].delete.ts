export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const id = getRouterParam(event, 'id')
  const court = await prisma.court.findFirst({ where: { id, clubId: club.id } })
  if (!court) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const today = todayDateStr()
  const blocked = await prisma.slot.findFirst({
    where: {
      courtId: court.id,
      date: { gte: today },
      displayStatus: { notIn: ['FREE', 'CANCELLED'] },
    },
  })
  if (blocked) {
    throw createError({ statusCode: 409, statusMessage: 'Court has active future bookings' })
  }

  await prisma.court.delete({ where: { id: court.id } })
  return { ok: true }
})
