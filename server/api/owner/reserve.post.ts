import { getPaymentsMode } from '#shared/payments.ts'
import { isPaidPaymentStatus } from '#shared/bookingPayment.ts'
import { normalizeIranPhone } from '#shared/phone.ts'
import {
  calculateSessionTotal,
  loadEquipmentForBooking,
  syncBookingEquipments,
} from '../../utils/bookingTotal'
import { notifyBookingConfirmed, notifyBookingPaid, clubNotifyName, clubNotifyLocation, courtNotifyName, personNotifyName } from '../../utils/bookingNotify'
import { rethrowSlotConflict, SlotNotAvailableError } from '../../utils/prismaErrors'
import { assertSlotBookable } from '../../utils/reservations'
import { clawbackOwnerForPayment, creditOwnerForPaidPayment } from '../../utils/settlement'
import { creditWallet } from '../../utils/wallet'
import { applyDiscountPercent } from '#shared/discountCode.ts'
import { assertDiscountUsable, findDiscountCodeByInput } from '../../utils/discountCodes'

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

/** Prefer normalized 09… for SMS; fall back to trimmed raw for storage. */
function resolveGuestMobile(raw?: string | null) {
  if (!raw?.trim()) return undefined
  return normalizeIranPhone(raw) || raw.trim()
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
    discountCode?: string
    skipNotify?: boolean
    notifyStartTime?: string
    notifyEndTime?: string
  }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })
  const guestMobile = resolveGuestMobile(body.guestMobile)

  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
    include: { booking: { include: { payment: true, user: true } }, court: true },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

  if (!slot.booking) {
    // Desk create: only FREE slots — never silently overwrite BLOCKED/RESERVED/etc.
    if (slot.displayStatus !== 'FREE') {
      throw createError({ statusCode: 409, statusMessage: 'Slot not available' })
    }
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
  let totalAmount = calculateSessionTotal({
    courtPrice: slot.price,
    equipmentPrices: equipmentItems.map((item) => (item.category === 'CLUB' ? 0 : item.price)),
  })
  if (body.discountCode) {
    const discountRow = await findDiscountCodeByInput(body.discountCode)
    if (!discountRow) throw createError({ statusCode: 400, statusMessage: 'Invalid discount code' })
    assertDiscountUsable(discountRow, club.id)
    totalAmount = applyDiscountPercent(totalAmount, discountRow.percent).total
  }
  // FREE is truthy — never keep FREE when creating/updating a desk booking unless explicitly set.
  const allowedDisplay = new Set(['RESERVED', 'TEAM', 'PENDING', 'PUBLIC'])
  const requestedDisplay = typeof body.displayStatus === 'string' ? body.displayStatus : undefined
  const displayStatus = (
    requestedDisplay && allowedDisplay.has(requestedDisplay)
      ? requestedDisplay
      : (!slot.booking || slot.displayStatus === 'FREE' ? 'RESERVED' : slot.displayStatus)
  ) as 'RESERVED' | 'TEAM' | 'PENDING' | 'PUBLIC'
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
    const becomingUnpaid = previousPaid && paymentStatus !== 'PAID'

    // Online IPG PAID must cancel (gateway reverse / wallet fallback) — desk mark-unpaid would drop money.
    if (
      becomingUnpaid
      && previousPayment
      && previousPayment.method === 'IPG'
      && isPaidPaymentStatus(previousPayment.status)
    ) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Online paid bookings must be cancelled to refund',
      })
    }

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
          guestMobile,
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

    if (becomingUnpaid && previousPayment) {
      try {
        await clawbackOwnerForPayment(previousPayment.id)
      } catch (err) {
        console.error('[reserve:ownerClawback]', previousPayment.id, err)
      }
    }

    if (becomingPaid) {
      const paidPayment = await prisma.payment.findUnique({ where: { bookingId: slot.booking.id } })
      if (paidPayment) {
        try {
          await creditOwnerForPaidPayment(paidPayment.id, previousPaid ? 'PAID' : '')
        } catch (err) {
          console.error('[reserve:ownerSettlement]', paidPayment.id, err)
        }
      }
      const phone = slot.booking.user?.phone || guestMobile || slot.booking.guestMobile
      if (slot.booking.userId || phone) {
        await notifyBookingPaid({
          userId: slot.booking.userId,
          email: slot.booking.user?.email,
          phone,
          kind: 'court',
          clubName: clubNotifyName(club),
          clubId: club.id,
          bookingId: slot.booking.id,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
        })
      }
    }
  } else {
    let createdBooking
    try {
      createdBooking = await prisma.$transaction(async (tx) => {
        const claimed = await tx.slot.updateMany({
          where: { id: slot.id, displayStatus: 'FREE' },
          data: { displayStatus },
        })
        if (claimed.count !== 1) {
          throw new SlotNotAvailableError()
        }
        const booking = await tx.booking.create({
          data: {
            slotId: slot.id,
            guestName: body.guestName,
            guestFamily: body.guestFamily,
            guestMobile,
            paymentMethod,
            comments: body.comments,
            source: 'CLUB',
            status: 'CONFIRMED',
            paymentStatus,
          },
        })
        await syncBookingEquipments(tx, booking.id, equipmentItems)
        await tx.payment.create({
          data: {
            bookingId: booking.id,
            amount: totalAmount,
            method: paymentMethod,
            status: paymentStatus,
            ...(provider ? { provider } : {}),
          },
        })
        await tx.reservationEvent.create({
          data: {
            bookingId: booking.id,
            type: 'CREATED',
            metadataJson: JSON.stringify({ source: 'owner-calendar' }),
          },
        })
        return booking
      })
    } catch (error: unknown) {
      rethrowSlotConflict(error)
    }

    const phone = guestMobile || null
    if (phone && !body.skipNotify) {
      const notifyBase = {
        phone,
        kind: 'court' as const,
        clubName: clubNotifyName(club),
        clubId: club.id,
        bookingId: createdBooking.id,
        date: slot.date,
        startTime: (body.notifyStartTime || slot.startTime).trim(),
        endTime: (body.notifyEndTime || slot.endTime).trim(),
        courtName: courtNotifyName(slot.court),
        paymentPaid: paymentStatus === 'PAID',
        guestName: personNotifyName(body.guestName, body.guestFamily),
        ...clubNotifyLocation(club),
      }
      await notifyBookingConfirmed(notifyBase)
      if (paymentStatus === 'PAID') {
        const paidPayment = await prisma.payment.findUnique({ where: { bookingId: createdBooking.id } })
        if (paidPayment) {
          try {
            await creditOwnerForPaidPayment(paidPayment.id, '')
          } catch (err) {
            console.error('[reserve:ownerSettlement]', paidPayment.id, err)
          }
        }
        await notifyBookingPaid(notifyBase)
      }
    } else if (paymentStatus === 'PAID') {
      const paidPayment = await prisma.payment.findUnique({ where: { bookingId: createdBooking.id } })
      if (paidPayment) {
        try {
          await creditOwnerForPaidPayment(paidPayment.id, '')
        } catch (err) {
          console.error('[reserve:ownerSettlement]', paidPayment.id, err)
        }
      }
    }
  }
  return { ok: true, amount: totalAmount, paymentStatus, paymentMethod }
})
