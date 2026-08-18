import { randomInt } from 'node:crypto'
import { PAY_PIN_ALPHABET, PAY_PIN_LENGTH, normalizePayPin } from '#shared/payPin.ts'
import { isUniqueConstraintError } from './prismaErrors'

export function generatePayPin() {
  let pin = ''
  for (let i = 0; i < PAY_PIN_LENGTH; i++) {
    pin += PAY_PIN_ALPHABET[randomInt(PAY_PIN_ALPHABET.length)]
  }
  return pin
}

/** Persist a unique pay pin on the booking. No-op if one already exists. */
export async function assignBookingPayPin(bookingId: string): Promise<string> {
  const existing = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { payPin: true },
  })
  const current = normalizePayPin(existing?.payPin)
  if (current) return current

  for (let attempt = 0; attempt < 8; attempt++) {
    const pin = generatePayPin()
    try {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { payPin: pin },
      })
      return pin
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) continue
      throw error
    }
  }
  throw createError({ statusCode: 500, statusMessage: 'Could not assign pay pin' })
}
