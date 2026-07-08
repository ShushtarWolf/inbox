export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'COACH')
  const coach = await prisma.coach.findUnique({ where: { userId: user.id }, include: { availability: true } })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })
  return coach
})
