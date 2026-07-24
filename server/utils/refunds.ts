import { isPaymentRefundable } from '#shared/bookingPayment.ts'
import { creditWallet } from './wallet'
import { syncPaymentToParent } from './paymentSync'
import { getPaymentService } from './payments/service'

export interface RefundResult {
  refunded: boolean
  walletCredited: boolean
  amount: number
}

function isOnlineGatewayPayment(payment: { method: string; provider: string }) {
  return payment.method === 'IPG' && ['log', 'sep', 'idpay'].includes(payment.provider)
}

export async function refundPaymentForCancellation(options: {
  paymentId: string
  userId?: string | null
  reason: string
  bookingId?: string
}): Promise<RefundResult> {
  const payment = await prisma.payment.findUnique({ where: { id: options.paymentId } })
  if (!payment || !isPaymentRefundable(payment.status)) {
    return { refunded: false, walletCredited: false, amount: 0 }
  }

  let walletCredited = false

  if (isOnlineGatewayPayment(payment)) {
    try {
      const service = getPaymentService(payment.provider)
      await service.refund(payment.id)
    } catch {
      if (options.userId) {
        await creditWallet(options.userId, payment.amount, {
          paymentId: payment.id,
          bookingId: options.bookingId,
          note: options.reason,
        })
        walletCredited = true
      }
    }
  } else if (options.userId) {
    await creditWallet(options.userId, payment.amount, {
      paymentId: payment.id,
      bookingId: options.bookingId,
      note: options.reason,
    })
    walletCredited = true
  } else {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED' },
    })
    await syncPaymentToParent(payment.id)
    return { refunded: true, walletCredited: false, amount: payment.amount }
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'REFUNDED' },
  })
  await syncPaymentToParent(payment.id)

  return { refunded: true, walletCredited, amount: payment.amount }
}
