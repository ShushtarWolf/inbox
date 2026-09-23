/** Owner desk: manual RELEASE/BLOCK override for one court hour (external calendar layer). */
export default defineEventHandler(async (event) => {
  const { user, club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    courtId?: string
    date?: string
    startTime?: string
    endTime?: string | null
    type?: string
  }>(event)

  const courtId = typeof body.courtId === 'string' ? body.courtId.trim() : ''
  const date = typeof body.date === 'string' ? body.date.trim() : ''
  const startTime = typeof body.startTime === 'string' ? body.startTime.trim().slice(0, 5) : ''
  const endTime =
    typeof body.endTime === 'string' && body.endTime.trim()
      ? body.endTime.trim().slice(0, 5)
      : null
  const typeRaw = typeof body.type === 'string' ? body.type.trim().toUpperCase() : ''

  if (!courtId || !date || !startTime) {
    throw createError({ statusCode: 400, statusMessage: 'courtId, date, and startTime required' })
  }
  if (typeRaw !== 'RELEASE' && typeRaw !== 'BLOCK') {
    throw createError({ statusCode: 400, statusMessage: 'type must be RELEASE or BLOCK' })
  }

  const court = await prisma.court.findFirst({
    where: { id: courtId, clubId: club.id },
    select: { id: true },
  })
  if (!court) throw createError({ statusCode: 404, statusMessage: 'Court not found' })

  const row = await prisma.manualAvailabilityOverride.upsert({
    where: {
      courtId_date_startTime: { courtId, date, startTime },
    },
    create: {
      clubId: club.id,
      courtId,
      date,
      startTime,
      endTime,
      type: typeRaw,
      createdById: user.id,
      updatedById: user.id,
    },
    update: {
      type: typeRaw,
      endTime,
      updatedById: user.id,
    },
    select: {
      id: true,
      courtId: true,
      date: true,
      startTime: true,
      endTime: true,
      type: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return { ok: true, override: row }
})
