export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const body = await readBody<{ url?: string; captionFa?: string; captionEn?: string }>(event)
  const url = body.url?.trim()
  if (!url) throw createError({ statusCode: 400, statusMessage: 'url required' })

  const count = await prisma.clubMedia.count({ where: { clubId: club.id } })
  return prisma.clubMedia.create({
    data: {
      clubId: club.id,
      url,
      sortOrder: count,
      captionFa: body.captionFa?.trim() || null,
      captionEn: body.captionEn?.trim() || null,
    },
  })
})
