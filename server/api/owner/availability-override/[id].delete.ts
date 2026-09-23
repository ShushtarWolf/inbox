/** Remove a manual availability override (owner desk). */
export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const existing = await prisma.manualAvailabilityOverride.findFirst({
    where: { id, clubId: club.id },
    select: { id: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Override not found' })

  await prisma.manualAvailabilityOverride.delete({ where: { id } })
  return { ok: true, id }
})
