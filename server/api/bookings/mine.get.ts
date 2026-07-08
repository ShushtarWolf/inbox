export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const courtBookings = await prisma.booking.findMany({
    where: { userId: user.id },
    include: {
      slot: { include: { court: { include: { club: true, sport: true } } } },
      coach: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  const coachSessions = await prisma.coachSession.findMany({
    where: { athleteId: user.id },
    include: { coach: { include: { sport: true } } },
    orderBy: { createdAt: 'desc' },
  })
  // #region agent log
  fetch('http://127.0.0.1:7459/ingest/150d6ec9-7ea4-4890-8fdc-843d504b2806',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a314a'},body:JSON.stringify({sessionId:'1a314a',runId:'pre-fix-athlete',hypothesisId:'E',location:'server/api/bookings/mine.get.ts',message:'bookings mine payload summary',data:{userId:user.id,courtBookingCount:courtBookings.length,coachSessionCount:coachSessions.length,nullSlotCount:courtBookings.filter((booking)=>!booking.slot).length,cancelledCourtBookingCount:courtBookings.filter((booking)=>booking.status==='CANCELLED').length,courtBookingSample:courtBookings.slice(0,3).map((booking)=>({id:booking.id,status:booking.status,slotId:booking.slotId,hasSlot:Boolean(booking.slot),slotStatus:booking.slot?.displayStatus ?? null,startTime:booking.slot?.startTime ?? null}))},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return { courtBookings, coachSessions }
})
