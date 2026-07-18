export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const { club } = await requireOwnerClub(event, 'team')
  const id = getRouterParam(event, 'id')
  const membership = await prisma.staffMembership.findFirst({
    where: { id, clubId: club.id, role: { not: 'OWNER' } },
  })
  if (!membership) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  await prisma.staffMembership.update({
    where: { id: membership.id },
    data: { active: false },
  })
  return { ok: true }
})
