export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'COACH')
  const coach = await prisma.coach.findUnique({ where: { userId: user.id } })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })

  const body = await readBody<{ url?: string; captionFa?: string; captionEn?: string }>(event)
  const url = body.url?.trim()
  if (!url) throw createError({ statusCode: 400, statusMessage: 'url required' })

  const count = await prisma.coachMedia.count({ where: { coachId: coach.id } })
  return prisma.coachMedia.create({
    data: {
      coachId: coach.id,
      url,
      sortOrder: count,
      captionFa: body.captionFa?.trim() || null,
      captionEn: body.captionEn?.trim() || null,
    },
  })
})
