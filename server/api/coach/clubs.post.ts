export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const body = await readBody<{ clubId?: string }>(event)
  const clubId = body.clubId?.trim()
  if (!clubId) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const coach = await prisma.coach.findUnique({
    where: { userId: user.id },
    select: { id: true, approvalStatus: true },
  })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })
  if (coach.approvalStatus !== 'APPROVED') {
    throw createError({ statusCode: 403, statusMessage: 'COACH_NOT_APPROVED' })
  }

  const club = await prisma.club.findFirst({ where: { id: clubId, status: 'ACTIVE' }, select: { id: true } })
  if (!club) throw createError({ statusCode: 404, statusMessage: 'Club not found' })

  const existing = await prisma.coachClubLink.findUnique({
    where: { coachId_clubId: { coachId: coach.id, clubId: club.id } },
  })
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Coach already requested this club' })
  }

  const link = await prisma.coachClubLink.create({
    data: { coachId: coach.id, clubId: club.id },
  })
  return { id: link.id, status: link.status }
})
