import { isOnlinePaymentsEnabled, isPaidPaymentStatus, isUnpaidPaymentStatus } from '#shared/bookingPayment.ts'
import { formatGuestDisplayName } from '#shared/guestName.ts'
import { formatSmsJalaliLongDate, formatSmsTime, toPersianDigits } from '#shared/jalali.ts'
import { bookingTrackingCode, parseReceiptToken } from '#shared/receiptToken.ts'
import { parseSeriesPaymentMeta } from '#shared/athleteSeason.ts'
import { receiptSigningSecret } from '../../utils/receipt'
import { loadSeriesGroupForBooking } from '../../utils/seriesCancelRefund'

function paymentStatusFa(status: string, bookingStatus: string) {
  if (bookingStatus === 'CANCELLED') return 'لغو شده'
  if (isPaidPaymentStatus(status)) return 'پرداخت شده'
  return 'منتظر پرداخت'
}

function paymentMethodFa(method: string | null | undefined, source: string) {
  if (source === 'CLUB') return 'لینک باشگاه'
  if (method === 'IPG') return 'پرداخت آنلاین'
  if (method === 'CASH') return 'نقدی در باشگاه'
  if (method === 'PAID') return 'کیف پول'
  return method || '—'
}

type SessionOut = {
  date: string
  startTime: string
  endTime: string
  courtName: string
  price: number
}

function sessionFromBooking(booking: {
  payment: { amount: number; metadataJson: string | null } | null
  slot: {
    date: string
    startTime: string
    endTime: string | null
    price: number
    court: { nameFa: string; nameEn: string }
  }
}): SessionOut {
  const meta = parseSeriesPaymentMeta(booking.payment?.metadataJson)
  const price = meta.sessionPrice ?? booking.payment?.amount ?? booking.slot.price
  return {
    date: formatSmsJalaliLongDate(booking.slot.date),
    startTime: formatSmsTime(booking.slot.startTime),
    endTime: booking.slot.endTime ? formatSmsTime(booking.slot.endTime) : '',
    courtName: toPersianDigits((booking.slot.court.nameFa || booking.slot.court.nameEn || '').trim()),
    price,
  }
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') || ''
  const bookingId = parseReceiptToken(token, receiptSigningSecret())
  if (!bookingId) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      payment: true,
      user: { select: { name: true, phone: true } },
      slot: { include: { court: { include: { club: true } } } },
    },
  })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const club = booking.slot.court.club
  const guestName = formatGuestDisplayName(booking.guestName, booking.guestFamily)
    || booking.user?.name
    || ''
  const mobile = booking.guestMobile || booking.user?.phone || ''
  const clubAddress = (club.addressFa || club.addressEn || '').trim()
  const clubPhone = (club.phone || '').trim()

  const series = await loadSeriesGroupForBooking(booking.id)

  let sessions: SessionOut[] = [sessionFromBooking(booking)]
  let amount = booking.payment?.amount ?? booking.slot.price
  let payStatus = booking.payment?.status || booking.paymentStatus
  let payMethod = booking.payment?.method || booking.paymentMethod
  let paySource = booking.source

  if (series) {
    const siblings = await prisma.booking.findMany({
      where: { id: { in: series.group.allBookingIds } },
      include: {
        payment: true,
        slot: { include: { court: true } },
      },
      orderBy: [{ slot: { date: 'asc' } }, { slot: { startTime: 'asc' } }],
    })
    const active = siblings.filter((b) => b.status !== 'CANCELLED')
    sessions = (active.length ? active : siblings).map(sessionFromBooking)
    amount = series.primaryPayment.amount
    payStatus = series.primaryPayment.status
    const primaryBooking = siblings.find((b) => b.id === series.group.primaryBookingId) || booking
    payMethod = primaryBooking.payment?.method || primaryBooking.paymentMethod
    paySource = primaryBooking.source
  }

  const unpaid = booking.status !== 'CANCELLED' && isUnpaidPaymentStatus(payStatus)
  const session = sessions[0] || sessionFromBooking(booking)

  return {
    trackingCode: toPersianDigits(bookingTrackingCode(series?.group.primaryBookingId || booking.id)),
    guestName,
    mobile: mobile ? toPersianDigits(mobile) : '',
    clubName: (club.nameFa || club.nameEn || '').trim() || 'باشگاه',
    clubAddress: clubAddress ? toPersianDigits(clubAddress) : '',
    clubPhone: clubPhone ? toPersianDigits(clubPhone) : '',
    reserveDate: formatSmsJalaliLongDate(booking.slot.date),
    paymentStatus: paymentStatusFa(payStatus, booking.status),
    paymentMethod: paymentMethodFa(payMethod, paySource),
    session,
    sessions,
    amount,
    unpaid,
    cancelled: booking.status === 'CANCELLED',
    canPayOnline: unpaid && isOnlinePaymentsEnabled(),
    kind: series ? 'season' : 'single',
  }
})
