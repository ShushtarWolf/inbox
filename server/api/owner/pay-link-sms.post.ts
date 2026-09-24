import { isPayPin, normalizePayPin } from '#shared/payPin.ts'
import { normalizeIranPhone } from '#shared/phone.ts'
import { payUrlForPin } from '../../utils/receipt'
import { sendBookingPayLinkSms } from '../../utils/bookingNotify'

/**
 * Owner desk: send tappable pay-link SMS via KAVENEGAR_TEMPLATE_PAY_LINK (e.g. payments).
 * Body: { phone, payPin }
 */
export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'owner:pay-link-sms')
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{ phone?: string; payPin?: string }>(event)

  const phone = normalizeIranPhone(body.phone || '')
  const payPin = normalizePayPin(body.payPin)
  if (!phone || !isPayPin(payPin)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid phone and pay pin required' })
  }

  // Ensure this pin belongs to a booking at this club.
  const booking = await prisma.booking.findFirst({
    where: {
      payPin,
      slot: { court: { clubId: club.id } },
    },
    select: { id: true, payPin: true, guestName: true },
  })
  if (!booking) {
    throw createError({ statusCode: 404, statusMessage: 'Pay link not found for this club' })
  }

  const result = await sendBookingPayLinkSms({
    phone,
    payPin,
    payUrl: payUrlForPin(payPin),
    guestName: booking.guestName,
    clubId: club.id,
  })

  if (result.reason === 'template_unset') {
    throw createError({
      statusCode: 503,
      statusMessage: 'Pay-link SMS template not configured',
    })
  }
  if (!result.sent) {
    throw createError({ statusCode: 502, statusMessage: 'Pay-link SMS failed' })
  }

  return { ok: true, sent: true }
})
