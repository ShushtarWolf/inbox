import { countsTowardRevenue, isUnpaidPaymentStatus } from '#shared/bookingPayment.ts'
import { resolveFinanceDiscount } from '#shared/financeDiscount.ts'
import { isoToJalaali, jalaaliToIso, toPersianDigits } from '#shared/jalali.ts'
import { localDateString, localTimeString } from '#shared/localDate.ts'
import { isOwnerRecurringBooking } from '#shared/recurringReserve.ts'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'finance:view')
  const query = getQuery(event)
  function queryText(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  }
  function queryTxLimit(value: unknown) {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return 50
    // ponytail: list cap. Older rows need a narrower txFrom/txTo, not a bigger take.
    return Math.min(1000, Math.floor(n))
  }
  function dateRange(from?: string, to?: string) {
    if (!from && !to) return undefined
    return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
  }

  const from = queryText(query.from)
  const to = queryText(query.to)
  const txFrom = queryText(query.txFrom)
  const txTo = queryText(query.txTo)
  const txLimit = queryTxLimit(query.txLimit)
  const legendQuery = queryText(query.legend)
  const slotLegendStatus = legendQuery === 'free' ? 'FREE' : legendQuery === 'blocked' ? 'BLOCKED' : null
  const wideList = txLimit > 50 || Boolean(txFrom || txTo)
  const statDate = dateRange(from, to)
  const listDate = dateRange(txFrom, txTo)
  const createdEvents = {
    where: { type: 'CREATED' as const },
    select: { metadataJson: true },
    take: 8,
  }
  const bookingInclude = {
    slot: { include: { court: true } },
    payment: true,
    user: { select: { name: true, phone: true } },
    coach: { select: { id: true, nameFa: true, nameEn: true } },
    bookingEquipments: { include: { equipment: true } },
    events: createdEvents,
  } as const
  const sessionInclude = {
    payment: true,
    coach: true,
    athlete: { select: { name: true, phone: true } },
    events: createdEvents,
  } as const

  function bookingWhere(range?: { gte?: string; lte?: string }) {
    return {
      slot: {
        court: { clubId: club.id },
        ...(range ? { date: range } : {}),
      },
    }
  }
  function sessionWhere(range?: { gte?: string; lte?: string }) {
    return {
      coach: { clubId: club.id },
      ...(range ? { date: range } : {}),
    }
  }

  const bookings = await prisma.booking.findMany({
    where: bookingWhere(statDate),
    include: bookingInclude,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const listBookings = wideList
    ? await prisma.booking.findMany({
      where: bookingWhere(listDate),
      include: bookingInclude,
      orderBy: { createdAt: 'desc' },
      take: txLimit,
    })
    : bookings
  const coachSessions = await prisma.coachSession.findMany({
    where: sessionWhere(statDate),
    include: sessionInclude,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const listSessions = wideList
    ? await prisma.coachSession.findMany({
      where: sessionWhere(listDate),
      include: sessionInclude,
      orderBy: { createdAt: 'desc' },
      take: txLimit,
    })
    : coachSessions
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

  function discountFields(paidAmount: number, paymentJson?: string | null, eventJson?: string | null) {
    const discount = resolveFinanceDiscount({
      paidAmount,
      paymentMetadataJson: paymentJson,
      eventMetadataJson: eventJson,
    })
    return {
      discountCode: discount?.code ?? null,
      discountPercent: discount?.percent ?? null,
      discountAmount: discount?.amount ?? 0,
      subtotalBeforeDiscount: discount?.subtotal ?? null,
      complimentary: discount?.complimentary ?? false,
    }
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
    total: totalReservationCount,
  }
  const today = todayDateStr()
  const jToday = isoToJalaali(today)
  const monthStart = jalaaliToIso(jToday.jy, jToday.jm, 1)

  const [bookingsTodayCount, sessionsTodayCount, noShowsTodayBookings, noShowsTodaySessions, cancelsMonthBookings, cancelsMonthSessions] = await Promise.all([
    prisma.booking.count({ where: { slot: { court: { clubId: club.id }, date: today } } }),
    prisma.coachSession.count({ where: { coach: { clubId: club.id }, date: today } }),
    prisma.booking.count({ where: { noShowAt: { not: null }, slot: { court: { clubId: club.id }, date: today } } }),
    prisma.coachSession.count({ where: { noShowAt: { not: null }, coach: { clubId: club.id }, date: today } }),
    prisma.booking.count({
      where: {
        status: 'CANCELLED',
        slot: { court: { clubId: club.id }, date: { gte: monthStart, lte: today } },
      },
    }),
    prisma.coachSession.count({
      where: {
        status: 'CANCELLED',
        coach: { clubId: club.id },
        date: { gte: monthStart, lte: today },
      },
    }),
  ])

  const bookingsToday = bookingsTodayCount + sessionsTodayCount
  const noShowsToday = noShowsTodayBookings + noShowsTodaySessions
  const cancellationsThisMonth = cancelsMonthBookings + cancelsMonthSessions

  function reservedStamp(date: string, startTime: string) {
    const time = /^\d{2}:\d{2}/.test(startTime || '') ? startTime.slice(0, 5) : '00:00'
    return `${date}T${time}:00`
  }

  function paidStamp(status: string, createdAt?: Date | null) {
    if (status !== 'PAID' || !createdAt) return null
    return `${localDateString(createdAt)}T${localTimeString(createdAt)}:00`
  }

  function courtBookingKind(booking: { packageDraftId?: string | null; coachId?: string | null }) {
    if (booking.packageDraftId) return 'package' as const
    if (booking.coachId) return 'coach' as const
    return 'normal' as const
  }

  const bookingTransactions = [
    ...listBookings.map((booking) => {
      const isCoachSession = Boolean(booking.coachId)
      const courtName = toPersianDigits(booking.slot.court.nameFa)
      const coachName = booking.coach?.nameFa ? toPersianDigits(booking.coach.nameFa) : ''
      const paymentStatus = paymentStatusOf(booking)
      return {
        id: booking.id,
        guestName: booking.guestName || booking.user?.name || 'Guest',
        guestMobile: booking.guestMobile || booking.user?.phone || null,
        paymentMethod: booking.payment?.method || booking.paymentMethod,
        paymentStatus,
        amount: amountOfBooking(booking),
        bookingStatus: booking.status,
        kind: 'court' as const,
        bookingKind: courtBookingKind(booking),
        sessionType: isCoachSession ? ('coach' as const) : ('free' as const),
        coachId: booking.coachId || null,
        coachName: booking.coach?.nameFa || null,
        reservationLabel: coachName ? `${courtName} · ${coachName}` : courtName,
        reservedAt: reservedStamp(booking.slot.date, booking.slot.startTime),
        paidAt: paidStamp(paymentStatus, booking.payment?.createdAt),
        displayStatus: booking.slot.displayStatus,
        comments: booking.comments,
        isRecurring: isOwnerRecurringBooking({
          packageDraftId: booking.packageDraftId,
          events: booking.events,
        }),
        equipmentSummary: booking.bookingEquipments
          .map((item) => {
            const qty = Math.max(1, item.quantity || 1)
            const name = toPersianDigits(item.equipment.nameFa)
            return qty > 1 ? `${name} ×${toPersianDigits(String(qty))}` : name
          })
          .join(', ') || null,
        unpaid: booking.status !== 'CANCELLED' && isUnpaidPaymentStatus(paymentStatusOf(booking)),
        ...discountFields(
          amountOfBooking(booking),
          booking.payment?.metadataJson,
          booking.events.find((row) => {
            const json = row.metadataJson || ''
            return json.includes('"discount') || json.includes('"complimentary"')
          })?.metadataJson,
        ),
      }
    }),
    ...listSessions.map((session) => {
      const paymentStatus = paymentStatusOf(session)
      return {
        id: session.id,
        guestName: session.athlete.name,
        guestMobile: session.athlete.phone || null,
        paymentMethod: session.payment?.method || null,
        paymentStatus,
        amount: amountOfSession(session),
        bookingStatus: session.status,
        kind: 'coach' as const,
        bookingKind: 'coach' as const,
        sessionType: 'coach' as const,
        coachId: session.coachId,
        coachName: session.coach.nameFa,
        reservationLabel: toPersianDigits(session.coach.nameFa),
        reservedAt: reservedStamp(session.date, session.startTime),
        paidAt: paidStamp(paymentStatus, session.payment?.createdAt),
        displayStatus: null,
        comments: null,
        isRecurring: isOwnerRecurringBooking({ events: session.events }),
        unpaid: session.status !== 'CANCELLED' && isUnpaidPaymentStatus(paymentStatus),
        ...discountFields(amountOfSession(session), session.payment?.metadataJson),
      }
    }),
  ]
    .sort((a, b) => (a.reservedAt < b.reservedAt ? 1 : a.reservedAt > b.reservedAt ? -1 : 0))
    .slice(0, txLimit)

  const coveredSlotIds = new Set(
    listBookings.filter((booking) => booking.status !== 'CANCELLED').map((booking) => booking.slotId),
  )
  const legendSlotRows = (slotLegendStatus
    ? courts.flatMap((court) => court.slots
        .filter((slot) => {
          if (slot.displayStatus !== slotLegendStatus) return false
          if (coveredSlotIds.has(slot.id)) return false
          if (listDate?.gte && slot.date < listDate.gte) return false
          if (listDate?.lte && slot.date > listDate.lte) return false
          return true
        })
        .map((slot) => ({
          id: `slot-${slot.id}`,
          guestName: '',
          guestMobile: null,
          paymentMethod: null,
          paymentStatus: '',
          amount: 0,
          bookingStatus: slot.displayStatus,
          kind: 'slot' as const,
          bookingKind: 'normal' as const,
          sessionType: 'free' as const,
          coachId: null,
          coachName: null,
          reservationLabel: toPersianDigits(court.nameFa),
          reservedAt: reservedStamp(slot.date, slot.startTime),
          paidAt: null,
          displayStatus: slot.displayStatus,
          comments: null,
          isRecurring: false,
          unpaid: false,
        })))
    : [])
    .sort((a, b) => (a.reservedAt < b.reservedAt ? 1 : a.reservedAt > b.reservedAt ? -1 : 0))
    .slice(0, txLimit)
  const transactions = [...bookingTransactions, ...legendSlotRows]

  return {
    stats: {
      revenue,
      unpaidAmount,
      unpaid,
      bookingsToday,
      noShowsToday,
      noShowCount,
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
      cancellations: cancellationsThisMonth,
      cancellationsThisMonth,
    },
  }
})
