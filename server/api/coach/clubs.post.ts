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
  // Allow PENDING coaches to queue affiliation requests; owner list only shows platform-APPROVED coaches.
  if (coach.approvalStatus === 'REJECTED') {
    throw createError({ statusCode: 403, statusMessage: 'COACH_REJECTED' })
  }

  const club = await prisma.club.findFirst({ where: { id: clubId, status: 'ACTIVE' }, select: { id: true } })
  if (!club) throw createError({ statusCode: 404, statusMessage: 'Club not found' })

  const existing = await prisma.coachClubLink.findUnique({
    where: { coachId_clubId: { coachId: coach.id, clubId: club.id } },
  })
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Coach already requested this club' })
  }

  const link = await ensurePendingCoachClubLink(coach.id, club.id)
  return { id: link.id, status: link.status }
})
