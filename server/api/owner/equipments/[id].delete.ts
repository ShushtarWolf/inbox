export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing equipment id' })

  const existing = await prisma.equipment.findFirst({ where: { id, clubId: club.id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Equipment not found' })

  await prisma.equipment.delete({ where: { id } })
  return { ok: true }
})
