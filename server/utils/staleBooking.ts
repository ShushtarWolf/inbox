import type { Prisma } from '@prisma/client'
import { createError } from 'h3'
import { parsePaymentMetadata } from '#shared/cancelRefund.ts'

/**
 * Booking.slotId is unique, so re-booking a slot removes its CANCELLED row first.
 * Payment.booking cascades on delete — detach the payment so money history
 * (PAID kept-on-cancel, REFUNDED, late IPG callbacks) survives the delete.
 */
export async function deleteStaleCancelledBooking(tx: Prisma.TransactionClient, bookingId: string) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      userId: true,
      slot: { select: { date: true, startTime: true, court: { select: { clubId: true } } } },
      payment: { select: { id: true, userId: true, metadataJson: true } },
    },
  })
  if (!booking) return
  if (booking.status !== 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: 'Slot not available' })
  }

  if (booking.payment) {
    const meta = parsePaymentMetadata(booking.payment.metadataJson)
    await tx.payment.update({
      where: { id: booking.payment.id },
      data: {
        bookingId: null,
        ...(booking.payment.userId || !booking.userId ? {} : { userId: booking.userId }),
        metadataJson: JSON.stringify({
          ...meta,
          detachedFromBookingId: booking.id,
          detachedClubId: booking.slot.court.clubId,
          detachedSlotDate: booking.slot.date,
          detachedSlotStart: booking.slot.startTime,
          detachedAt: new Date().toISOString(),
        }),
      },
    })
  }

  await tx.booking.delete({ where: { id: booking.id } })
}

/** Payment whose cancelled booking was removed for a re-book (see deleteStaleCancelledBooking). */
export function isDetachedCancelledPayment(payment: {
  bookingId?: string | null
  metadataJson?: string | null
}): boolean {
  if (payment.bookingId) return false
  return typeof parsePaymentMetadata(payment.metadataJson).detachedFromBookingId === 'string'
}

export function readDetachedClubId(metadataJson: string | null | undefined): string | null {
  const id = parsePaymentMetadata(metadataJson).detachedClubId
  return typeof id === 'string' && id.length > 0 ? id : null
}

/** Club that owns this payment row (live FK or detached cancel metadata). */
export function resolvePaymentClubId(payment: {
  metadataJson?: string | null
  booking?: { slot?: { court?: { clubId?: string } } } | null
  packageBooking?: { package?: { clubId?: string } } | null
  competitionEntry?: { competition?: { clubId?: string } } | null
  coachSession?: { coach?: { clubId?: string } } | null
}): string | null {
  return payment.booking?.slot?.court?.clubId
    || payment.packageBooking?.package?.clubId
    || payment.competitionEntry?.competition?.clubId
    || payment.coachSession?.coach?.clubId
    || readDetachedClubId(payment.metadataJson)
    || null
}
