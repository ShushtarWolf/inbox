import { isValidSheba } from '#shared/settlement.ts'
import { parsePaymentMetadata } from '#shared/cancelRefund.ts'
import { parseReceiptToken } from '#shared/receiptToken.ts'
import { receiptSigningSecret } from '../../../utils/receipt'

/** Optional guest SHEBA on pay-link receipt — helps ops manual bank refund. */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') || ''
  const bookingId = parseReceiptToken(token, receiptSigningSecret())
  if (!bookingId) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const body = await readBody<{ sheba?: string }>(event)
  const sheba = body.sheba?.trim() || ''
  if (!isValidSheba(sheba)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid SHEBA' })
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  })
  if (!booking?.payment) throw createError({ statusCode: 404, statusMessage: 'Payment not found' })

  const meta = parsePaymentMetadata(booking.payment.metadataJson)
  await prisma.payment.update({
    where: { id: booking.payment.id },
    data: {
      metadataJson: JSON.stringify({
        ...meta,
        guestSheba: sheba,
        guestShebaAt: new Date().toISOString(),
      }),
    },
  })
  return { ok: true }
})
