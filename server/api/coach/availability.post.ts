export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'COACH')
  const coach = await prisma.coach.findUnique({ where: { userId: user.id } })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })

  const body = await readBody<{ dayOfWeek?: number; startTime?: string; endTime?: string }>(event)
  if (body.dayOfWeek === undefined || !body.startTime || !body.endTime) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }
  if (body.dayOfWeek < 0 || body.dayOfWeek > 6) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid day' })
  }

  return prisma.coachAvailability.create({
    data: {
      coachId: coach.id,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
    },
  })
})
