/** Desk: save/clear owner note on an externally occupied hour (no Inbox booking). */
export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    courtId?: string
    date?: string
    startTime?: string
    endTime?: string | null
    note?: string | null
  }>(event)

  const courtId = typeof body.courtId === 'string' ? body.courtId.trim() : ''
  const date = typeof body.date === 'string' ? body.date.trim() : ''
  const startTimeRaw = typeof body.startTime === 'string' ? body.startTime.trim() : ''
  const startTime = startTimeRaw.slice(0, 5)
  const endTime =
    typeof body.endTime === 'string' && body.endTime.trim()
      ? body.endTime.trim().slice(0, 5)
      : null
  const note = typeof body.note === 'string' ? body.note.trim() : ''

  if (!courtId || !date || !startTime) {
    throw createError({ statusCode: 400, statusMessage: 'courtId, date, and startTime required' })
  }
  if (note.length > 2000) {
    throw createError({ statusCode: 400, statusMessage: 'note too long' })
  }

  const court = await prisma.court.findFirst({
    where: { id: courtId, clubId: club.id },
    select: { id: true },
  })
  if (!court) throw createError({ statusCode: 404, statusMessage: 'Court not found' })

  if (!note) {
    await prisma.ownerExternalNote.deleteMany({
      where: { clubId: club.id, courtId, date, startTime },
    })
    return { ok: true, courtId, date, startTime, note: null }
  }

  const row = await prisma.ownerExternalNote.upsert({
    where: {
      courtId_date_startTime: { courtId, date, startTime },
    },
    create: {
      clubId: club.id,
      courtId,
      date,
      startTime,
      endTime,
      note,
    },
    update: {
      note,
      ...(endTime ? { endTime } : {}),
    },
  })

  return { ok: true, courtId, date, startTime, note: row.note }
})
