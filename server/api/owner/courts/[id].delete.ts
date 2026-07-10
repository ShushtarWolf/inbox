export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const id = getRouterParam(event, 'id')
  const court = await prisma.court.findFirst({ where: { id, clubId: club.id } })
  if (!court) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  await prisma.court.delete({ where: { id: court.id } })
  return { ok: true }
})
