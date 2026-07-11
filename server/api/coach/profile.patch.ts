export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'COACH')
  const coach = await prisma.coach.findUnique({ where: { userId: user.id } })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })
  const body = await readBody<{ bioFa?: string; bioEn?: string; sessionPrice?: number; photo?: string | null; locale?: string }>(event)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      locale: body.locale === 'en' ? 'en' : body.locale === 'fa' ? 'fa' : undefined,
    },
  })
  const photo = body.photo !== undefined ? (body.photo?.trim() || null) : undefined
  if (photo && !/^https?:\/\/.+/i.test(photo)) {
    throw createError({ statusCode: 400, statusMessage: 'photo must be a valid http(s) URL' })
  }
  return prisma.coach.update({
    where: { id: coach.id },
    data: {
      bioFa: body.bioFa,
      bioEn: body.bioEn ?? body.bioFa,
      sessionPrice: body.sessionPrice !== undefined ? Math.round(body.sessionPrice) : undefined,
      photo,
    },
  })
})
