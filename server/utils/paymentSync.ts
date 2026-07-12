import type { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client'

type DbClient = Prisma.TransactionClient | typeof prisma

function resolveParentPaymentMethod(method: PaymentMethod, status: PaymentStatus): PaymentMethod | undefined {
  if (status === 'PAID' && method === 'IPG') return 'IPG'
  if (status === 'PAID' && method === 'CASH') return 'CASH'
  if (status === 'REFUNDED') return method
  return undefined
}

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
