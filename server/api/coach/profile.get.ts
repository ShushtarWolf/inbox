export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'COACH')
  const coach = await prisma.coach.findUnique({
    where: { userId: user.id },
    include: {
      availability: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      media: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })
  return coach
})
