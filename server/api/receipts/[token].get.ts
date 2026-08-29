import { isOnlinePaymentsEnabled, isPaidPaymentStatus, isUnpaidPaymentStatus } from '#shared/bookingPayment.ts'
import { formatGuestDisplayName } from '#shared/guestName.ts'
import { formatSmsJalaliLongDate, formatSmsTime, toPersianDigits } from '#shared/jalali.ts'
import { bookingTrackingCode, parseReceiptToken } from '#shared/receiptToken.ts'
import { receiptSigningSecret } from '../../utils/receipt'

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
  const amount = booking.payment?.amount ?? booking.slot.price
  const payStatus = booking.payment?.status || booking.paymentStatus
  const unpaid = booking.status !== 'CANCELLED' && isUnpaidPaymentStatus(payStatus)

  return {
    trackingCode: toPersianDigits(bookingTrackingCode(booking.id)),
    guestName,
    mobile: mobile ? toPersianDigits(mobile) : '',
    clubName: (club.nameFa || club.nameEn || '').trim() || 'باشگاه',
    reserveDate: formatSmsJalaliLongDate(booking.slot.date),
    paymentStatus: paymentStatusFa(payStatus, booking.status),
    paymentMethod: paymentMethodFa(booking.payment?.method || booking.paymentMethod, booking.source),
    session: {
      date: formatSmsJalaliLongDate(booking.slot.date),
      startTime: formatSmsTime(booking.slot.startTime),
      endTime: booking.slot.endTime ? formatSmsTime(booking.slot.endTime) : '',
      courtName: toPersianDigits((booking.slot.court.nameFa || booking.slot.court.nameEn || '').trim()),
      price: amount,
    },
    amount,
    unpaid,
    cancelled: booking.status === 'CANCELLED',
    canPayOnline: unpaid && isOnlinePaymentsEnabled(),
  }
})
