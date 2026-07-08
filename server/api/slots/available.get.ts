export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const clubSlug = query.club as string
  const date = (query.date as string) || todayDateStr()
  if (!clubSlug) throw createError({ statusCode: 400, statusMessage: 'club required' })

  const club = await prisma.club.findUnique({ where: { slug: clubSlug } })
  if (!club) throw createError({ statusCode: 404, statusMessage: 'Club not found' })

  await ensureSlotsForDate(club.id, date)

  const slots = await prisma.slot.findMany({
    where: { court: { clubId: club.id }, date, displayStatus: 'FREE' },
    include: { court: { include: { sport: true } } },
    orderBy: [{ courtId: 'asc' }, { startTime: 'asc' }],
  })
  const freeSlotsWithBookings = await prisma.slot.findMany({
    where: { court: { clubId: club.id }, date, displayStatus: 'FREE', booking: { isNot: null } },
    select: { id: true, startTime: true, booking: { select: { id: true, status: true } } },
    take: 5,
  })
  // #region agent log
  fetch('http://127.0.0.1:7459/ingest/150d6ec9-7ea4-4890-8fdc-843d504b2806',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a314a'},body:JSON.stringify({sessionId:'1a314a',runId:'pre-fix',hypothesisId:'A',location:'server/api/slots/available.get.ts',message:'available slots computed',data:{clubSlug,date,freeCount:slots.length,freeWithBookingCount:freeSlotsWithBookings.length,freeWithBookingSample:freeSlotsWithBookings.map((slot)=>({id:slot.id,startTime:slot.startTime,bookingId:slot.booking?.id,bookingStatus:slot.booking?.status}))},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return slots
})
