import { countsTowardRevenue, isUnpaidPaymentStatus } from '#shared/bookingPayment.ts'
import { parsePaymentMetadata, readDeskCashReturn } from '#shared/cancelRefund.ts'
import { resolveFinanceDiscount } from '#shared/financeDiscount.ts'
import { resolveLinkedGuestDisplayName } from '#shared/guestName.ts'
import { isoToJalaali, jalaaliToIso, toPersianDigits } from '#shared/jalali.ts'
import { addDaysToIsoDate, localDateString, localTimeString } from '#shared/localDate.ts'
import { paymentRail, summarizeCollectedRevenue, type RevenueRow } from '#shared/ownerRevenue.ts'
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

  function isBlockedSlot(booking: (typeof bookings)[number]) {
    return booking.slot.displayStatus === 'BLOCKED'
  }

  /** Receivable/collected sums use Payment.amount only — siblings and comps are 0, never slot price. */
  function strictBookingAmount(booking: { payment?: { amount: number } | null; slot: { price: number } }) {
    return booking.payment ? booking.payment.amount : booking.slot.price
  }
  function strictSessionAmount(session: { payment?: { amount: number } | null; price: number }) {
    return session.payment ? session.payment.amount : session.price
  }

  const activeBookings = bookings.filter((booking) => booking.status !== 'CANCELLED')
  const activeSessions = coachSessions.filter((session) => session.status !== 'CANCELLED')
  const paidBookings = activeBookings.filter((booking) => countsTowardRevenue(booking.status, paymentStatusOf(booking)))
  const paidSessions = activeSessions.filter((session) => countsTowardRevenue(session.status, paymentStatusOf(session)))
  // Blocks are desk holds, not receivables — keep them out of unpaid chips/totals.
  const unpaidBookings = activeBookings.filter((booking) => !isBlockedSlot(booking) && isUnpaidPaymentStatus(paymentStatusOf(booking)))
  const unpaidSessions = activeSessions.filter((session) => isUnpaidPaymentStatus(paymentStatusOf(session)))

  const unpaidAmount =
    unpaidBookings.reduce((sum, booking) => sum + strictBookingAmount(booking), 0)
    + unpaidSessions.reduce((sum, session) => sum + strictSessionAmount(session), 0)
  const unpaid = unpaidBookings.length + unpaidSessions.length

  // Collected money for the current Jalali month + last 7 days — full query, not the 50-row list sample.
  const today = todayDateStr()
  const jToday = isoToJalaali(today)
  const monthStart = jalaaliToIso(jToday.jy, jToday.jm, 1)
  const weekStart = addDaysToIsoDate(today, -6)
  const revenueFrom = weekStart < monthStart ? weekStart : monthStart
  const [revenueBookingRows, revenueSessionRows] = await Promise.all([
    prisma.booking.findMany({
      where: {
        slot: { court: { clubId: club.id }, date: { gte: revenueFrom, lte: today } },
        payment: { isNot: null },
      },
      select: {
        status: true,
        slot: { select: { date: true } },
        payment: { select: { id: true, amount: true, method: true, status: true } },
      },
    }),
    prisma.coachSession.findMany({
      where: {
        coach: { clubId: club.id },
        date: { gte: revenueFrom, lte: today },
        payment: { isNot: null },
      },
      select: {
        status: true,
        date: true,
        payment: { select: { amount: true, method: true, status: true } },
      },
    }),
  ])
  const courtRevenueRows = revenueBookingRows.map((row) => ({
    date: row.slot.date,
    paymentId: row.payment!.id,
    revenue: {
      amount: row.payment!.amount,
      method: row.payment!.method,
      status: row.payment!.status,
      bookingStatus: row.status,
    } satisfies RevenueRow,
  }))
  // Coach lesson fees settle to the coach wallet (online) or the coach (cash) — not club money.
  const coachFeeRows = revenueSessionRows.map((row) => ({
    date: row.date,
    revenue: {
      amount: row.payment!.amount,
      method: row.payment!.method,
      status: row.payment!.status,
      bookingStatus: row.status,
    } satisfies RevenueRow,
  }))
  const monthCourt = courtRevenueRows.filter((row) => row.date >= monthStart)
  const monthSummary = summarizeCollectedRevenue(monthCourt.map((row) => row.revenue))
  const coachFeesMonth = summarizeCollectedRevenue(
    coachFeeRows.filter((row) => row.date >= monthStart).map((row) => row.revenue),
  )
  // Online net actually credited to the club wallet (after commission, minus clawbacks).
  const onlinePaymentIds = monthCourt
    .filter((row) => row.revenue.status === 'PAID' && paymentRail(row.revenue.method) === 'online')
    .map((row) => row.paymentId)
  const onlineLedger = onlinePaymentIds.length
    ? await prisma.settlementLedgerEntry.findMany({
        where: { paymentId: { in: onlinePaymentIds }, clubId: club.id, clawedBackAt: null },
        select: { ownerNet: true },
      })
    : []
  const onlineNetMonth = onlineLedger.reduce((sum, entry) => sum + entry.ownerNet, 0)
  const revenue = monthSummary.total

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
    // Tehran calendar day (slot dates are Tehran), not UTC.
    const key = addDaysToIsoDate(today, -offset)
    weekLabels.push(key)
    weeklyRevenue.push(
      summarizeCollectedRevenue(courtRevenueRows.filter((row) => row.date === key).map((row) => row.revenue)).total,
    )
  }

  // Status-first buckets (court bookings, this month). Wallet (method PAID) is online — never till cash.
  const paymentTotals = { PAID_CASH: 0, PAID_IPG: 0, UNPAID: 0 }
  for (const row of monthCourt) {
    if (row.revenue.bookingStatus === 'CANCELLED') continue
    const status = row.revenue.status || ''
    if (isUnpaidPaymentStatus(status)) {
      paymentTotals.UNPAID += 1
      continue
    }
    if (status === 'PAID') {
      const rail = paymentRail(row.revenue.method)
      if (rail === 'online') paymentTotals.PAID_IPG += 1
      else if (rail === 'cash') paymentTotals.PAID_CASH += 1
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
      const blocked = isBlockedSlot(booking)
      return {
        id: booking.id,
        guestName: resolveLinkedGuestDisplayName({
          guestName: booking.guestName,
          guestFamily: booking.guestFamily,
          userName: booking.user?.name,
        }),
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
        unpaid: !blocked && booking.status !== 'CANCELLED' && isUnpaidPaymentStatus(paymentStatus),
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

  // Desk cash cancels awaiting till-return ack (dual-rail: not wallet).
  const cashRefunded = await prisma.payment.findMany({
    where: {
      method: 'CASH',
      status: 'REFUNDED',
      booking: { slot: { court: { clubId: club.id } } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 40,
    include: {
      booking: {
        select: {
          id: true,
          guestName: true,
          guestFamily: true,
          guestMobile: true,
          slot: { select: { date: true, startTime: true, court: { select: { nameFa: true } } } },
        },
      },
    },
  })
  const deskCashReturnsOwed = cashRefunded
    .filter((p) => readDeskCashReturn(parsePaymentMetadata(p.metadataJson)) === 'owed')
    .map((p) => ({
      paymentId: p.id,
      amount: p.amount,
      guestName: [p.booking?.guestName, p.booking?.guestFamily].filter(Boolean).join(' ').trim(),
      guestMobile: p.booking?.guestMobile || null,
      date: p.booking?.slot.date || null,
      startTime: p.booking?.slot.startTime || null,
      courtName: p.booking?.slot.court.nameFa || null,
    }))

  return {
    /**
     * Club money this Jalali month by rail. `cash` is in the club's own till;
     * `online` (SEP + athlete wallet) settles to the club wallet as `onlineNet`.
     * Coach lesson fees are reported separately — they never belong to the club.
     */
    revenueBreakdown: {
      cash: monthSummary.cash,
      online: monthSummary.online,
      onlineNet: onlineNetMonth,
      keptOnCancel: monthSummary.keptOnCancel,
      coachFees: coachFeesMonth.total,
    },
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
    deskCashReturnsOwed,
    segments: {
      activeContacts,
      churnRisk,
      waitlist: waitlistEntries.length,
      cancellations: cancellationsThisMonth,
      cancellationsThisMonth,
    },
  }
})
