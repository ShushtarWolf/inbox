import type { Prisma } from '@prisma/client'
import { resolveParentPaymentMethod } from '#shared/bookingPayment.ts'

type DbClient = Prisma.TransactionClient | typeof prisma

export async function syncPaymentToParent(paymentId: string, db: DbClient = prisma) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment) return

  const paymentMethod = resolveParentPaymentMethod(payment.method, payment.status)

  if (payment.bookingId) {
    await db.booking.update({
      where: { id: payment.bookingId },
      data: {
        paymentStatus: payment.status,
        ...(paymentMethod ? { paymentMethod } : {}),
      },
    })
  }

  if (payment.coachSessionId) {
    await db.coachSession.update({
      where: { id: payment.coachSessionId },
      data: { paymentStatus: payment.status },
    })
  }

  if (payment.packageBookingId) {
    await db.packageBooking.update({
      where: { id: payment.packageBookingId },
      data: { paymentStatus: payment.status },
    })
  }
}

export async function confirmPaymentAndSync(providerRef: string, providerName?: string) {
  const service = getPaymentService(providerName)
  const intent = await service.confirm(providerRef)
  await syncPaymentToParent(intent.id)
  return intent
}
