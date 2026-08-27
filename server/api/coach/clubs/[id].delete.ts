export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const coach = await prisma.coach.findUnique({
    where: { userId: user.id },
    select: { id: true, clubId: true },
  })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })

  const link = await prisma.coachClubLink.findFirst({ where: { id, coachId: coach.id } })
  if (!link) throw createError({ statusCode: 404, statusMessage: 'Link not found' })

  await prisma.$transaction(async (tx) => {
    await tx.coachClubLink.delete({ where: { id } })
    if (coach.clubId === link.clubId) {
      await tx.coach.update({ where: { id: coach.id }, data: { clubId: null } })
    }
  })

  return { ok: true }
})
