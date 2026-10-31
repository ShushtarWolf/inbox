import { createError } from 'h3'
import {
  buildDeskCashReturnedMetadata,
  parsePaymentMetadata,
  readDeskCashReturn,
} from '#shared/cancelRefund.ts'
import { syncPaymentToParent } from './paymentSync'
import { prisma } from './prisma'

/**
 * Owner acknowledges that desk till cash was physically returned to the guest.
 * Only valid for CASH payments already marked REFUNDED with deskCashReturn=owed.
 */
export async function acknowledgeDeskCashReturn(options: {
  paymentId: string
  clubId: string
  note?: string
}) {
  const payment = await prisma.payment.findUnique({
    where: { id: options.paymentId },
    include: {
      booking: { include: { slot: { include: { court: { select: { clubId: true } } } } } },
      packageBooking: { include: { package: { select: { clubId: true } } } },
      competitionEntry: { include: { competition: { select: { clubId: true } } } },
      coachSession: { include: { coach: { select: { clubId: true } } } },
    },
  })
  if (!payment) {
    throw createError({ statusCode: 404, statusMessage: 'Payment not found' })
  }
  if (payment.method !== 'CASH') {
    throw createError({ statusCode: 409, statusMessage: 'Not a desk cash payment' })
  }
  if (payment.status !== 'REFUNDED') {
    throw createError({ statusCode: 409, statusMessage: 'Payment is not in REFUNDED state' })
  }

  const clubId = payment.booking?.slot?.court?.clubId
    || payment.packageBooking?.package?.clubId
    || payment.competitionEntry?.competition?.clubId
    || payment.coachSession?.coach?.clubId
    || null
  if (!clubId || clubId !== options.clubId) {
    throw createError({ statusCode: 403, statusMessage: 'Payment does not belong to this club' })
  }

  const meta = parsePaymentMetadata(payment.metadataJson)
  const current = readDeskCashReturn(meta)
  if (current === 'returned') {
    return { ok: true as const, already: true as const, paymentId: payment.id }
  }
  if (current !== 'owed' && meta.refundChannel !== 'desk_cash') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Payment is not awaiting desk cash return acknowledgment',
    })
  }

  const next = buildDeskCashReturnedMetadata(meta, { note: options.note })
  await prisma.payment.update({
    where: { id: payment.id },
    data: { metadataJson: JSON.stringify(next) },
  })
  await syncPaymentToParent(payment.id)
  return { ok: true as const, already: false as const, paymentId: payment.id }
}
