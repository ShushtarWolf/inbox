export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event)
  if (event.method === 'GET') {
    return prisma.packageDraft.findMany({ where: { clubId: club.id }, include: { coach: true } })
  }
  const body = await readBody<{
    title?: string
    capacity?: number
    price?: number
    discount?: number
    startDate?: string
    finishDate?: string
    coachId?: string
    comment?: string
    daysJson?: string
    equipmentId?: string
  }>(event)
  return prisma.packageDraft.create({
    data: {
      clubId: club.id,
      title: body.title || 'پکیج جدید',
      capacity: body.capacity || 8,
      price: body.price || 0,
      discount: body.discount || 0,
      startDate: body.startDate,
      finishDate: body.finishDate,
      daysJson: body.daysJson,
      coachId: body.coachId,
      comment: body.equipmentId ? [body.comment, `equipment:${body.equipmentId}`].filter(Boolean).join(' | ') : body.comment,
    },
  })
})
