export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'COACH')
  const coach = await prisma.coach.findUnique({ where: { userId: user.id } })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const media = await prisma.coachMedia.findFirst({ where: { id, coachId: coach.id } })
  if (!media) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  await prisma.coachMedia.delete({ where: { id } })
  return { ok: true }
})
