import { getPaymentsMode } from '#shared/payments.ts'
import { isPaidPaymentStatus } from '#shared/bookingPayment.ts'
import {
  calculateSessionTotal,
  loadEquipmentForBooking,
  syncBookingEquipments,
} from '../../utils/bookingTotal'
import { notifyBookingPaid } from '../../utils/bookingNotify'
import { assertSlotBookable } from '../../utils/reservations'
import { creditWallet } from '../../utils/wallet'

function resolveDeskPaymentMethod(
  requested: string | undefined,
  previousMethod?: string | null,
): 'IPG' | 'CASH' {
  const mode = getPaymentsMode()
  if (mode === 'pay_at_club') return 'CASH'
  if (requested === 'IPG' || requested === 'CASH') return requested
  if (previousMethod === 'IPG' || previousMethod === 'CASH') return previousMethod
  return 'CASH'
}

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    guestName?: string
    guestFamily?: string
    guestMobile?: string
    paymentMethod?: string
    paymentStatus?: string
    comments?: string
    displayStatus?: string
    equipmentIds?: string[]
  }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
    include: { booking: { include: { payment: true, user: true } } },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

  if (!slot.booking) {
    assertSlotBookable(slot.date, slot.startTime)
  }

  const paymentMethod = resolveDeskPaymentMethod(
    body.paymentMethod,
    slot.booking?.payment?.method || slot.booking?.paymentMethod,
  )
  const paymentStatus = body.paymentStatus === 'PAID' ? 'PAID' : 'PAY_AT_CLUB'
  const previousPaid = Boolean(
    slot.booking
    && (isPaidPaymentStatus(slot.booking.payment?.status) || isPaidPaymentStatus(slot.booking.paymentStatus)),
  )
  const becomingPaid = paymentStatus === 'PAID' && !previousPaid
  const equipmentIds = [...new Set(body.equipmentIds || [])]
  const equipmentItems = await loadEquipmentForBooking(club.id, equipmentIds)
  const totalAmount = calculateSessionTotal({
    courtPrice: slot.price,
    equipmentPrices: equipmentItems.map((item) => (item.category === 'CLUB' ? 0 : item.price)),
  })
  const displayStatus = (body.displayStatus as 'RESERVED' | 'TEAM' | 'PENDING' | 'PUBLIC' | undefined)
    || slot.displayStatus
    || 'RESERVED'
  const provider = getPaymentsMode() === 'pay_at_club' ? 'pay_at_club' : undefined

  if (slot.booking) {
    const previousPayment = slot.booking.payment
    const wasWalletPaid = Boolean(
      previousPayment
      && isPaidPaymentStatus(previousPayment.status)
      && previousPayment.method === 'PAID'
      && paymentStatus !== 'PAID'
      && slot.booking.userId,
    )

    await prisma.$transaction(async (tx) => {
      if (wasWalletPaid && previousPayment && slot.booking?.userId) {
        await creditWallet(slot.booking.userId, previousPayment.amount, {
          paymentId: previousPayment.id,
          bookingId: slot.booking.id,
          note: 'Wallet payment reversed (marked unpaid at club)',
        }, tx)
      }

      await tx.booking.update({
        where: { id: slot.booking!.id },
        data: {
          guestName: body.guestName,
          guestFamily: body.guestFamily,
          guestMobile: body.guestMobile,
          paymentMethod,
          comments: body.comments,
          paymentStatus,
          status: 'CONFIRMED',
        },
      })
      await syncBookingEquipments(tx, slot.booking!.id, equipmentItems)
      await tx.payment.upsert({
        where: { bookingId: slot.booking!.id },
        update: {
          amount: totalAmount,
          method: paymentMethod,
          status: paymentStatus,
          ...(provider ? { provider } : {}),
        },
        create: {
          bookingId: slot.booking!.id,
          amount: totalAmount,
          method: paymentMethod,
          status: paymentStatus,
          ...(provider ? { provider } : {}),
        },
      })
      await tx.slot.update({
        where: { id: slot.id },
        data: { displayStatus },
      })
    })

    if (becomingPaid && slot.booking.userId) {
      await notifyBookingPaid({
        userId: slot.booking.userId,
        email: slot.booking.user?.email,
        kind: 'court',
        clubName: club.nameEn || club.nameFa,
        clubId: club.id,
        bookingId: slot.booking.id,
        date: slot.date,
        startTime: slot.startTime,
      })
    }
  } else {
    await prisma.$transaction(async (tx) => {
      const createdBooking = await tx.booking.create({
        data: {
          slotId: slot.id,
          guestName: body.guestName,
          guestFamily: body.guestFamily,
          guestMobile: body.guestMobile,
          paymentMethod,
          comments: body.comments,
          source: 'CLUB',
          status: 'CONFIRMED',
          paymentStatus,
        },
      })
      await syncBookingEquipments(tx, createdBooking.id, equipmentItems)
      await tx.payment.create({
        data: {
          bookingId: createdBooking.id,
          amount: totalAmount,
          method: paymentMethod,
          status: paymentStatus,
          ...(provider ? { provider } : {}),
        },
      })
      await tx.reservationEvent.create({
        data: {
          bookingId: createdBooking.id,
          type: 'CREATED',
          metadataJson: JSON.stringify({ source: 'owner-calendar' }),
        },
      })
      await tx.slot.update({
        where: { id: slot.id },
        data: { displayStatus },
      })
    })
  }
  return { ok: true, amount: totalAmount, paymentStatus, paymentMethod }
})
