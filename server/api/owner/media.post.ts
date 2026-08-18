import { parseClubImageInput } from '#shared/clubImageUrl.ts'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const body = await readBody<{ url?: string; captionFa?: string; captionEn?: string }>(event)
  const parsed = parseClubImageInput(body.url)
  if (!parsed.ok || !parsed.value) {
    throw createError({ statusCode: 400, statusMessage: 'url must be a valid image URL' })
  }
  const url = parsed.value

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
