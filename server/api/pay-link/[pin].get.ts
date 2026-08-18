import { isPayPin, normalizePayPin } from '#shared/payPin.ts'
import { parseReceiptToken, signReceiptToken } from '#shared/receiptToken.ts'
import { enforceRateLimit } from '../../utils/rateLimit'
import { receiptSigningSecret } from '../../utils/receipt'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'pay-link')
  const pin = normalizePayPin(getRouterParam(event, 'pin'))
  if (!isPayPin(pin)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const booking = await prisma.booking.findUnique({
    where: { payPin: pin },
    select: { id: true },
  })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const token = signReceiptToken(booking.id, receiptSigningSecret())
  if (!parseReceiptToken(token, receiptSigningSecret())) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return { token }
})
