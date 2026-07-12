export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'team')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const existing = await prisma.clubWorker.findFirst({
    where: { id, clubId: club.id, active: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  await prisma.clubWorker.update({
    where: { id },
    data: { active: false },
  })

  return { ok: true }
})
