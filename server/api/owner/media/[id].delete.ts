export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const media = await prisma.clubMedia.findFirst({ where: { id, clubId: club.id } })
  if (!media) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  await prisma.clubMedia.delete({ where: { id } })
  return { ok: true }
})
