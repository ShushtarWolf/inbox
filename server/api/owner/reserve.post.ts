import { getPaymentsMode } from '#shared/payments.ts'
import { isPaidPaymentStatus } from '#shared/bookingPayment.ts'
import { normalizeIranPhone } from '#shared/phone.ts'
import {
  calculateSessionTotal,
  equipmentLineTotal,
  loadEquipmentForBooking,
  parseEquipmentSelections,
  syncBookingEquipments,
} from '../../utils/bookingTotal'
import { findUserIdByPhone } from '../../utils/phoneAuth'
import {
  notifyBookingConfirmed,
  notifyBookingPaid,
  notifyOwnerBookingPaid,
  clubNotifyName,
  clubNotifyLocation,
  courtNotifyName,
  ownerNotifyPhone,
  personNotifyName,
} from '../../utils/bookingNotify'
import { rethrowSlotConflict, SlotNotAvailableError } from '../../utils/prismaErrors'
import { activeSlotBooking, assertSlotBookable } from '../../utils/reservations'
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
    equipmentQuantities?: Record<string, number>
    discountCode?: string
    skipNotify?: boolean
    notifyStartTime?: string
    notifyEndTime?: string
  }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })
  const guestMobile = resolveGuestMobile(body.guestMobile)
  const linkedUserId = await findUserIdByPhone(guestMobile)

  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
    include: { booking: { include: { payment: true, user: true } }, court: true },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

  const staleCancelled = slot.booking?.status === 'CANCELLED' ? slot.booking : null
  const existing = activeSlotBooking(slot.booking)

  if (!existing) {
    // Desk create: only FREE slots — never silently overwrite BLOCKED/RESERVED/etc.
    if (slot.displayStatus !== 'FREE') {
      throw createError({ statusCode: 409, statusMessage: 'Slot not available' })
    }
    assertSlotBookable(slot.date, slot.startTime)
  }

  const paymentMethod = resolveDeskPaymentMethod(
    body.paymentMethod,
    existing?.payment?.method || existing?.paymentMethod,
  )
  const paymentStatus = body.paymentStatus === 'PAID' ? 'PAID' : 'PAY_AT_CLUB'
  const previousPaid = Boolean(
    existing
    && (isPaidPaymentStatus(existing.payment?.status) || isPaidPaymentStatus(existing.paymentStatus)),
  )
  const becomingPaid = paymentStatus === 'PAID' && !previousPaid
  const equipmentSelections = parseEquipmentSelections(body.equipmentIds, body.equipmentQuantities)
  const equipmentItems = await loadEquipmentForBooking(club.id, equipmentSelections)
  if (equipmentSelections.length && equipmentItems.length !== equipmentSelections.length) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid equipment' })
  }
  let totalAmount = calculateSessionTotal({
    courtPrice: slot.price,
    equipmentPrices: equipmentItems.map((item) => equipmentLineTotal(item)),
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
      : (!existing || slot.displayStatus === 'FREE' ? 'RESERVED' : slot.displayStatus)
  ) as 'RESERVED' | 'TEAM' | 'PENDING' | 'PUBLIC'
  const provider = getPaymentsMode() === 'pay_at_club' ? 'pay_at_club' : undefined

  if (existing) {
    const previousPayment = existing.payment
    const wasWalletPaid = Boolean(
      previousPayment
      && isPaidPaymentStatus(previousPayment.status)
      && previousPayment.method === 'PAID'
      && paymentStatus !== 'PAID'
      && existing.userId,
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
      if (wasWalletPaid && previousPayment && existing.userId) {
        await creditWallet(existing.userId, previousPayment.amount, {
          paymentId: previousPayment.id,
          bookingId: existing.id,
          note: 'Wallet payment reversed (marked unpaid at club)',
        }, tx)
      }

      await tx.booking.update({
        where: { id: existing.id },
        data: {
          guestName: body.guestName,
          guestFamily: body.guestFamily,
          guestMobile,
          paymentMethod,
          comments: body.comments,
          paymentStatus,
          status: 'CONFIRMED',
          // Attach to athlete when desk phone matches a registered user; never clear an existing link.
          ...(linkedUserId ? { userId: linkedUserId } : {}),
        },
      })
      await syncBookingEquipments(tx, existing.id, equipmentItems)
      await tx.payment.upsert({
        where: { bookingId: existing.id },
        update: {
          amount: totalAmount,
          method: paymentMethod,
          status: paymentStatus,
          ...(provider ? { provider } : {}),
        },
        create: {
          bookingId: existing.id,
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
      const paidPayment = await prisma.payment.findUnique({ where: { bookingId: existing.id } })
      if (paidPayment) {
        try {
          await creditOwnerForPaidPayment(paidPayment.id, previousPaid ? 'PAID' : '')
        } catch (err) {
          console.error('[reserve:ownerSettlement]', paidPayment.id, err)
        }
      }
      const phone = existing.user?.phone || guestMobile || existing.guestMobile
      const guestName = personNotifyName(
        body.guestName ?? existing.guestName,
        body.guestFamily ?? existing.guestFamily,
      ) || existing.user?.name || ''
      const amountPaid = paidPayment?.amount ?? totalAmount
      if (existing.userId || phone) {
        await notifyBookingPaid({
          userId: existing.userId,
          email: existing.user?.email,
          phone,
          kind: 'court',
          clubName: clubNotifyName(club),
          clubId: club.id,
          bookingId: existing.id,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          courtName: courtNotifyName(slot.court),
          guestName,
          amountPaid,
          paymentPaid: true,
        })
      }
      const ownerClub = await prisma.club.findUnique({
        where: { id: club.id },
        select: { phone: true, nameFa: true, nameEn: true, owner: { select: { phone: true } } },
      })
      await notifyOwnerBookingPaid({
        ownerPhone: ownerClub ? ownerNotifyPhone(ownerClub) : club.phone,
        clubName: clubNotifyName(ownerClub || club),
        clubId: club.id,
        bookingId: existing.id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        courtName: courtNotifyName(slot.court),
        guestName,
        guestPhone: phone,
        amountPaid,
      })
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
        // Unique Booking.slotId: remove cancelled row before creating the new desk booking.
        if (staleCancelled) {
          await tx.booking.delete({ where: { id: staleCancelled.id } })
        }
        const booking = await tx.booking.create({
          data: {
            slotId: slot.id,
            userId: linkedUserId || undefined,
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
    const guestName = personNotifyName(body.guestName, body.guestFamily)
    const notifyStart = (body.notifyStartTime || slot.startTime).trim()
    const notifyEnd = (body.notifyEndTime || slot.endTime).trim()
    const skipGuest = !phone || Boolean(body.skipNotify)
    const notifyBase = {
      userId: linkedUserId || undefined,
      phone,
      kind: 'court' as const,
      clubName: clubNotifyName(club),
      clubId: club.id,
      bookingId: createdBooking.id,
      date: slot.date,
      startTime: notifyStart,
      endTime: notifyEnd,
      courtName: courtNotifyName(slot.court),
      paymentPaid: paymentStatus === 'PAID',
      guestName,
      amountPaid: totalAmount,
      skipGuest,
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

    if (paymentStatus === 'PAID') {
      const paidPayment = await prisma.payment.findUnique({ where: { bookingId: createdBooking.id } })
      const ownerClub = await prisma.club.findUnique({
        where: { id: club.id },
        select: { phone: true, nameFa: true, nameEn: true, owner: { select: { phone: true } } },
      })
      await notifyOwnerBookingPaid({
        ownerPhone: ownerClub ? ownerNotifyPhone(ownerClub) : club.phone,
        clubName: clubNotifyName(ownerClub || club),
        clubId: club.id,
        bookingId: createdBooking.id,
        date: slot.date,
        startTime: notifyStart,
        endTime: notifyEnd,
        courtName: courtNotifyName(slot.court),
        guestName,
        guestPhone: phone,
        amountPaid: paidPayment?.amount ?? totalAmount,
      })
    }
  }
  return { ok: true, amount: totalAmount, paymentStatus, paymentMethod }
})
