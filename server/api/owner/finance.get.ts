export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event)
  const query = getQuery(event)
  const from = query.from as string | undefined
  const to = query.to as string | undefined
  const bookings = await prisma.booking.findMany({
    where: {
      slot: {
        court: { clubId: club.id },
        ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
    },
    include: { slot: { include: { court: true } }, payment: true, user: { select: { name: true, phone: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const coachSessions = await prisma.coachSession.findMany({
    where: {
      coach: { clubId: club.id },
      ...(from || to ? { date: { gte: from, lte: to } } : {}),
    },
    include: { payment: true, coach: true, athlete: { select: { name: true, phone: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const contacts = await prisma.contact.findMany({ where: { clubId: club.id } })
  const waitlistEntries = await prisma.waitlistEntry.findMany({ where: { clubId: club.id } })
  const courts = await prisma.court.findMany({ where: { clubId: club.id }, include: { slots: true } })
  const paidBookings = bookings.filter((booking) => booking.paymentStatus === 'PAID').length
  const paidSessions = coachSessions.filter((session) => session.paymentStatus === 'PAID').length
  const revenue =
    bookings.reduce((sum, booking) => sum + (booking.payment?.amount || booking.slot.price), 0) +
    coachSessions.reduce((sum, session) => sum + (session.payment?.amount || session.price), 0)
  const totalReservationCount = bookings.length + coachSessions.length
  const cancelledCount = bookings.filter((booking) => booking.status === 'CANCELLED').length + coachSessions.filter((session) => session.status === 'CANCELLED').length
  const noShowCount = bookings.filter((booking) => booking.noShowAt).length + coachSessions.filter((session) => session.noShowAt).length
  const bookableSlots = courts.reduce((sum, court) => sum + court.slots.filter((slot) => slot.displayStatus !== 'CLOSED').length, 0)
  const usedSlots = courts.reduce((sum, court) => sum + court.slots.filter((slot) => slot.displayStatus !== 'FREE').length, 0)
  const activeContacts = contacts.filter((contact) => contact.inactiveDays < 7).length
  const churnRisk = contacts.filter((contact) => contact.inactiveDays >= 14).length
  const ltv = contacts.length ? Math.round(contacts.reduce((sum, contact) => sum + contact.lifetimeValue, 0) / contacts.length) : 0
  const funnel = {
    views: totalReservationCount + waitlistEntries.length,
    initiated: totalReservationCount + waitlistEntries.length,
    confirmed: bookings.filter((booking) => booking.status === 'CONFIRMED').length + coachSessions.filter((session) => session.status === 'CONFIRMED').length,
    paid: paidBookings + paidSessions,
  }
  return {
    stats: {
      revenue,
      bookingsToday: totalReservationCount,
      pending: bookings.filter((b) => b.status === 'PENDING').length,
      paidRate: totalReservationCount ? Math.round(((paidBookings + paidSessions) / totalReservationCount) * 100) : 0,
      utilization: bookableSlots ? Math.round((usedSlots / bookableSlots) * 100) : 0,
      ltv,
      churnRisk,
      noShowRate: totalReservationCount ? Math.round((noShowCount / totalReservationCount) * 100) : 0,
    },
    funnel,
    transactions: [
      ...bookings.map((booking) => ({
        id: booking.id,
        guestName: booking.guestName || booking.user?.name || 'Guest',
        guestMobile: booking.guestMobile || booking.user?.phone || null,
        paymentMethod: booking.payment?.method || booking.paymentMethod,
        paymentStatus: booking.payment?.status || booking.paymentStatus,
        amount: booking.payment?.amount || booking.slot.price,
        bookingStatus: booking.status,
        kind: 'court',
        reservationLabel: `${booking.slot.date} · ${booking.slot.startTime}`,
      })),
      ...coachSessions.map((session) => ({
        id: session.id,
        guestName: session.athlete.name,
        guestMobile: session.athlete.phone || null,
        paymentMethod: session.payment?.method || null,
        paymentStatus: session.payment?.status || session.paymentStatus,
        amount: session.payment?.amount || session.price,
        bookingStatus: session.status,
        kind: 'coach',
        reservationLabel: `${session.date} · ${session.startTime}`,
        coachName: session.coach.nameFa,
      })),
    ].slice(0, 50),
    segments: {
      activeContacts,
      churnRisk,
      waitlist: waitlistEntries.length,
      cancellations: cancelledCount,
    },
  }
})
