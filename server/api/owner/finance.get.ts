import { countsTowardRevenue, isUnpaidPaymentStatus } from '#shared/bookingPayment.ts'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'finance:view')
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
    include: {
      slot: { include: { court: true } },
      payment: true,
      user: { select: { name: true, phone: true } },
      bookingEquipments: { include: { equipment: true } },
    },
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

  function paymentStatusOf(item: { payment?: { status?: string } | null; paymentStatus?: string }) {
    return item.payment?.status || item.paymentStatus || 'PAY_AT_CLUB'
  }

  function amountOfBooking(booking: (typeof bookings)[number]) {
    return booking.payment?.amount || booking.slot.price
  }

  function amountOfSession(session: (typeof coachSessions)[number]) {
    return session.payment?.amount || session.price
  }

  const activeBookings = bookings.filter((booking) => booking.status !== 'CANCELLED')
  const activeSessions = coachSessions.filter((session) => session.status !== 'CANCELLED')
  const paidBookings = activeBookings.filter((booking) => countsTowardRevenue(booking.status, paymentStatusOf(booking)))
  const paidSessions = activeSessions.filter((session) => countsTowardRevenue(session.status, paymentStatusOf(session)))
  const unpaidBookings = activeBookings.filter((booking) => isUnpaidPaymentStatus(paymentStatusOf(booking)))
  const unpaidSessions = activeSessions.filter((session) => isUnpaidPaymentStatus(paymentStatusOf(session)))

  const revenue =
    paidBookings.reduce((sum, booking) => sum + amountOfBooking(booking), 0)
    + paidSessions.reduce((sum, session) => sum + amountOfSession(session), 0)
  const unpaidAmount =
    unpaidBookings.reduce((sum, booking) => sum + amountOfBooking(booking), 0)
    + unpaidSessions.reduce((sum, session) => sum + amountOfSession(session), 0)
  const unpaid = unpaidBookings.length + unpaidSessions.length

  const totalReservationCount = bookings.length + coachSessions.length
  const cancelledCount = bookings.filter((booking) => booking.status === 'CANCELLED').length + coachSessions.filter((session) => session.status === 'CANCELLED').length
  const noShowCount = bookings.filter((booking) => booking.noShowAt).length + coachSessions.filter((session) => session.noShowAt).length
  const bookableSlots = courts.reduce((sum, court) => sum + court.slots.filter((slot) => slot.displayStatus !== 'CLOSED' && slot.displayStatus !== 'BLOCKED').length, 0)
  const usedSlots = courts.reduce((sum, court) => sum + court.slots.filter((slot) => slot.displayStatus !== 'FREE').length, 0)
  const activeContacts = contacts.filter((contact) => contact.inactiveDays < 7).length
  const churnRisk = contacts.filter((contact) => contact.inactiveDays >= 14).length
  const ltv = contacts.length ? Math.round(contacts.reduce((sum, contact) => sum + contact.lifetimeValue, 0) / contacts.length) : 0

  const weekLabels: string[] = []
  const weeklyRevenue: number[] = []
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date()
    day.setDate(day.getDate() - offset)
    const key = day.toISOString().slice(0, 10)
    weekLabels.push(key)
    const dayRevenue =
      bookings
        .filter((booking) => booking.slot.date === key && countsTowardRevenue(booking.status, paymentStatusOf(booking)))
        .reduce((sum, booking) => sum + amountOfBooking(booking), 0)
      + coachSessions
        .filter((session) => session.date === key && countsTowardRevenue(session.status, paymentStatusOf(session)))
        .reduce((sum, session) => sum + amountOfSession(session), 0)
    weeklyRevenue.push(dayRevenue)
  }

  // Status-first buckets for pay-at-club clarity (not method-only).
  const paymentTotals = { PAID_CASH: 0, PAID_IPG: 0, UNPAID: 0 }
  for (const booking of activeBookings) {
    const status = paymentStatusOf(booking)
    if (isUnpaidPaymentStatus(status)) {
      paymentTotals.UNPAID += 1
      continue
    }
    if (status === 'PAID') {
      const method = booking.payment?.method || booking.paymentMethod || 'CASH'
      if (method === 'IPG') paymentTotals.PAID_IPG += 1
      else paymentTotals.PAID_CASH += 1
    }
  }
  for (const session of activeSessions) {
    const status = paymentStatusOf(session)
    if (isUnpaidPaymentStatus(status)) {
      paymentTotals.UNPAID += 1
      continue
    }
    if (status === 'PAID') {
      const method = session.payment?.method || 'CASH'
      if (method === 'IPG') paymentTotals.PAID_IPG += 1
      else paymentTotals.PAID_CASH += 1
    }
  }
  const paymentCount = paymentTotals.PAID_CASH + paymentTotals.PAID_IPG + paymentTotals.UNPAID
  const paymentBreakdown = {
    PAID_CASH: paymentCount ? Math.round((paymentTotals.PAID_CASH / paymentCount) * 100) : 0,
    PAID_IPG: paymentCount ? Math.round((paymentTotals.PAID_IPG / paymentCount) * 100) : 0,
    UNPAID: paymentCount ? Math.round((paymentTotals.UNPAID / paymentCount) * 100) : 0,
    // Legacy keys kept for older clients / smoke scripts.
    IPG: paymentCount ? Math.round((paymentTotals.PAID_IPG / paymentCount) * 100) : 0,
    CASH: paymentCount ? Math.round((paymentTotals.PAID_CASH / paymentCount) * 100) : 0,
    NOT_PAID: paymentCount ? Math.round((paymentTotals.UNPAID / paymentCount) * 100) : 0,
  }

  const funnel = {
    views: totalReservationCount + waitlistEntries.length,
    initiated: totalReservationCount + waitlistEntries.length,
    confirmed: bookings.filter((booking) => booking.status === 'CONFIRMED').length + coachSessions.filter((session) => session.status === 'CONFIRMED').length,
    paid: paidBookings.length + paidSessions.length,
  }
  const today = todayDateStr()
  const bookingsToday = bookings.filter((b) => b.slot.date === today).length
    + coachSessions.filter((s) => s.date === today).length

  const transactions = [
    ...bookings.map((booking) => ({
      id: booking.id,
      guestName: booking.guestName || booking.user?.name || 'Guest',
      guestMobile: booking.guestMobile || booking.user?.phone || null,
      paymentMethod: booking.payment?.method || booking.paymentMethod,
      paymentStatus: paymentStatusOf(booking),
      amount: amountOfBooking(booking),
      bookingStatus: booking.status,
      kind: 'court' as const,
      reservationLabel: `${booking.slot.date} · ${booking.slot.startTime}`,
      equipmentSummary: booking.bookingEquipments
        .map((item) => item.equipment.nameFa)
        .join(', ') || null,
      unpaid: booking.status !== 'CANCELLED' && isUnpaidPaymentStatus(paymentStatusOf(booking)),
    })),
    ...coachSessions.map((session) => ({
      id: session.id,
      guestName: session.athlete.name,
      guestMobile: session.athlete.phone || null,
      paymentMethod: session.payment?.method || null,
      paymentStatus: paymentStatusOf(session),
      amount: amountOfSession(session),
      bookingStatus: session.status,
      kind: 'coach' as const,
      reservationLabel: `${session.date} · ${session.startTime}`,
      coachName: session.coach.nameFa,
      unpaid: session.status !== 'CANCELLED' && isUnpaidPaymentStatus(paymentStatusOf(session)),
    })),
  ]
    .sort((a, b) => Number(b.unpaid) - Number(a.unpaid))
    .slice(0, 50)

  return {
    stats: {
      revenue,
      unpaidAmount,
      unpaid,
      bookingsToday,
      paidRate: totalReservationCount ? Math.round(((paidBookings.length + paidSessions.length) / totalReservationCount) * 100) : 0,
      utilization: bookableSlots ? Math.round((usedSlots / bookableSlots) * 100) : 0,
      ltv,
      churnRisk,
      noShowRate: totalReservationCount ? Math.round((noShowCount / totalReservationCount) * 100) : 0,
    },
    funnel,
    weeklyRevenue,
    weekLabels,
    paymentBreakdown,
    transactions,
    segments: {
      activeContacts,
      churnRisk,
      waitlist: waitlistEntries.length,
      cancellations: cancelledCount,
    },
  }
})
